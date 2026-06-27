const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createDeck, shuffleDeck } = require('./gameLogic');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
    }
});

const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('create_room', (playerName) => {
        const roomCode = generateRoomCode();
        
        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, hand: [] }],
            deck: [],
            discardPile: [],
            currentTurn: 0,
            gameStarted: false
        };

        socket.join(roomCode);
        socket.emit('room_created', { roomCode, players: rooms[roomCode].players });
    });

    socket.on('join_room', ({ roomCode, playerName }) => {
        const code = roomCode.toUpperCase();
        
        if (!rooms[code]) {
            return socket.emit('error_message', 'Room not found.');
        }
        if (rooms[code].gameStarted) {
            return socket.emit('error_message', 'Game has already started.');
        }
        if (rooms[code].players.length >= 4) {
            return socket.emit('error_message', 'Room is full.');
        }

        rooms[code].players.push({ id: socket.id, name: playerName, hand: [] });
        socket.join(code);

        io.to(code).emit('room_updated', { players: rooms[code].players });
    });

    socket.on('start_game', (roomCode) => {
        const code = roomCode.toUpperCase();
        const room = rooms[code];

        if (!room) return;
        if (room.players.length < 2) {
            return socket.emit('error_message', 'Need at least 2 players to start.');
        }

        room.gameStarted = true;
        let freshDeck = createDeck();
        room.deck = shuffleDeck(freshDeck);

        // Deal 7 cards to each player
        room.players.forEach(player => {
            player.hand = room.deck.splice(0, 7);
        });

        // Flip top card to discard pile (ensure it is not a wild card for simplicity)
        let topCard = room.deck.pop();
        room.discardPile.push(topCard);

        // Send unique game start packages to each individual player
        room.players.forEach(player => {
            io.to(player.id).emit('game_started', {
                hand: player.hand,
                topCard: topCard,
                players: room.players.map(p => ({ name: p.name, cardCount: p.hand.length })),
                currentTurn: room.currentTurn
            });
        });
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    io.to(roomCode).emit('room_updated', { players: room.players });
                }
                break;
            }
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
