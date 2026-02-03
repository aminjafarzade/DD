const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = [
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 11 },
  { rank: "Q", value: 12 },
  { rank: "K", value: 13 },
  { rank: "A", value: 14 }
];

let currentRoom = null;

function generateId(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function sanitizeName(name, fallback) {
  if (!name || typeof name !== "string") return fallback;
  const cleaned = name.trim().slice(0, 16);
  return cleaned.length > 0 ? cleaned : fallback;
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const { rank, value } of RANKS) {
      deck.push({
        id: generateId(10),
        suit,
        rank,
        value
      });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createRoom(roomId, settings) {
  return {
    id: roomId,
    status: "waiting",
    settings,
    players: [],
    deck: [],
    trumpCard: null,
    trumpSuit: null,
    table: { piles: [] },
    discard: [],
    phase: "attacking",
    roundLimit: null,
    attackerId: null,
    defenderId: null,
    result: null
  };
}

function resetRoom(room) {
  room.status = "waiting";
  room.deck = [];
  room.trumpCard = null;
  room.trumpSuit = null;
  room.table = { piles: [] };
  room.discard = [];
  room.phase = "attacking";
  room.roundLimit = null;
  room.attackerId = null;
  room.defenderId = null;
  room.result = null;
  room.players.forEach((player) => {
    player.hand = [];
  });
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function takeCardFromHand(player, cardId) {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) return null;
  return player.hand.splice(index, 1)[0];
}

function dealInitialHands(room) {
  room.players.forEach((player) => {
    player.hand = [];
  });

  for (let i = 0; i < 6; i += 1) {
    for (const player of room.players) {
      if (room.deck.length === 0) return;
      player.hand.push(room.deck.pop());
    }
  }
}

function lowestTrumpValue(hand, trumpSuit) {
  let min = Infinity;
  for (const card of hand) {
    if (card.suit === trumpSuit && card.value < min) {
      min = card.value;
    }
  }
  return min;
}

function determineFirstAttacker(room) {
  const [playerA, playerB] = room.players;
  const trumpSuit = room.trumpSuit;
  const aMin = lowestTrumpValue(playerA.hand, trumpSuit);
  const bMin = lowestTrumpValue(playerB.hand, trumpSuit);

  if (aMin < bMin) return [playerA.id, playerB.id];
  if (bMin < aMin) return [playerB.id, playerA.id];

  const randomFirst = Math.random() < 0.5 ? playerA.id : playerB.id;
  const randomSecond = randomFirst === playerA.id ? playerB.id : playerA.id;
  return [randomFirst, randomSecond];
}

function startGame(room) {
  room.status = "playing";
  room.deck = shuffle(createDeck());
  room.trumpCard = room.deck[0];
  room.trumpSuit = room.trumpCard.suit;
  room.table = { piles: [] };
  room.discard = [];
  room.result = null;
  room.phase = "attacking";
  room.roundLimit = null;

  dealInitialHands(room);

  const [attackerId, defenderId] = determineFirstAttacker(room);
  room.attackerId = attackerId;
  room.defenderId = defenderId;
}

function ranksOnTable(room) {
  const ranks = new Set();
  for (const pile of room.table.piles) {
    ranks.add(pile.attack.rank);
    if (pile.defense) ranks.add(pile.defense.rank);
  }
  return ranks;
}

function getMaxPairs(room) {
  return room.discard.length === 0 ? 5 : 6;
}

function getAttackLimit(room) {
  const maxPairs = getMaxPairs(room);
  if (room.roundLimit !== null) {
    return Math.min(room.roundLimit, maxPairs);
  }

  const defender = findPlayer(room, room.defenderId);
  const defenderLimit = defender ? defender.hand.length : 0;
  return Math.min(defenderLimit, maxPairs);
}

function canBeat(attackCard, defenseCard, trumpSuit) {
  if (defenseCard.suit === attackCard.suit && defenseCard.value > attackCard.value) {
    return true;
  }
  if (defenseCard.suit === trumpSuit && attackCard.suit !== trumpSuit) {
    return true;
  }
  if (defenseCard.suit === trumpSuit && attackCard.suit === trumpSuit && defenseCard.value > attackCard.value) {
    return true;
  }
  return false;
}

function collectTableCards(room) {
  const cards = [];
  for (const pile of room.table.piles) {
    cards.push(pile.attack);
    if (pile.defense) cards.push(pile.defense);
  }
  return cards;
}

function drawToSix(room, playerIds) {
  for (const playerId of playerIds) {
    const player = findPlayer(room, playerId);
    if (!player) continue;

    while (player.hand.length < 6 && room.deck.length > 0) {
      player.hand.push(room.deck.pop());
    }
  }
}

function checkGameEnd(room) {
  if (room.deck.length > 0) return;
  const emptyPlayers = room.players.filter((player) => player.hand.length === 0);

  if (emptyPlayers.length === 0) return;

  if (emptyPlayers.length === 2) {
    room.status = "finished";
    room.result = { outcome: "draw" };
    return;
  }

  const winner = emptyPlayers[0];
  const loser = room.players.find((player) => player.id !== winner.id);
  room.status = "finished";
  room.result = { outcome: "win", winnerId: winner.id, loserId: loser ? loser.id : null };
}

function computeActionHints(room, player) {
  const isAttacker = player.id === room.attackerId;
  const isDefender = player.id === room.defenderId;
  const piles = room.table.piles;
  const tableHasAttacks = piles.length > 0;
  const allDefended = tableHasAttacks && piles.every((pile) => pile.defense);
  const anyUndefended = piles.some((pile) => !pile.defense);
  const ranks = ranksOnTable(room);
  const attackLimit = getAttackLimit(room);

  const hasAttackCard = tableHasAttacks
    ? player.hand.some((card) => ranks.has(card.rank))
    : player.hand.length > 0;

  const canAttack =
    room.status === "playing" &&
    isAttacker &&
    (room.phase === "attacking" || room.phase === "taking") &&
    piles.length < attackLimit &&
    hasAttackCard;

  const canEndTurn =
    room.status === "playing" &&
    isAttacker &&
    tableHasAttacks &&
    ((room.phase === "attacking" && allDefended) || room.phase === "taking");

  const canTake =
    room.status === "playing" && isDefender && room.phase === "attacking" && anyUndefended;

  const canTransfer =
    room.status === "playing" &&
    isDefender &&
    room.phase === "attacking" &&
    room.settings.perevod &&
    tableHasAttacks &&
    piles.every((pile) => !pile.defense) &&
    piles.length < attackLimit &&
    player.hand.some((card) => ranks.has(card.rank));

  const canDefend =
    room.status === "playing" && isDefender && room.phase === "attacking" && anyUndefended;

  return { canAttack, canEndTurn, canTake, canTransfer, canDefend };
}

function buildStateForPlayer(room, player) {
  return {
    type: "state",
    roomId: room.id,
    status: room.status,
    settings: room.settings,
    youId: player.id,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length
    })),
    yourHand: player.hand,
    attackerId: room.attackerId,
    defenderId: room.defenderId,
    table: room.table,
    deckCount: room.deck.length,
    trumpCard: room.trumpCard,
    trumpSuit: room.trumpSuit,
    discardCount: room.discard.length,
    phase: room.phase,
    attackLimit: getAttackLimit(room),
    actionHints: computeActionHints(room, player),
    result: room.result
  };
}

function broadcastState(room) {
  for (const player of room.players) {
    if (!player.socket || player.socket.readyState !== WebSocket.OPEN) continue;
    player.socket.send(JSON.stringify(buildStateForPlayer(room, player)));
  }
}

function sendError(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "error", message }));
  }
}

app.post("/api/create", (req, res) => {
  const { perevod } = req.body || {};

  if (currentRoom && currentRoom.status !== "finished" && currentRoom.players.length > 0) {
    return res.status(409).json({ error: "A game is already running." });
  }

  const roomId = generateId(6);
  currentRoom = createRoom(roomId, { perevod: Boolean(perevod) });

  return res.json({ roomId });
});

app.get("/api/room/:roomId", (req, res) => {
  if (!currentRoom || currentRoom.id !== req.params.roomId) {
    return res.status(404).json({ error: "Room not found." });
  }
  return res.json({
    roomId: currentRoom.id,
    status: currentRoom.status,
    settings: currentRoom.settings,
    players: currentRoom.players.length
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      sendError(socket, "Invalid message format.");
      return;
    }

    if (!message || typeof message.type !== "string") {
      sendError(socket, "Invalid message payload.");
      return;
    }

    if (message.type === "join") {
      if (!currentRoom || currentRoom.id !== message.roomId) {
        sendError(socket, "Room not found.");
        return;
      }

      if (currentRoom.players.length >= 2) {
        sendError(socket, "Room is full.");
        return;
      }

      const playerNumber = currentRoom.players.length + 1;
      const player = {
        id: generateId(8),
        name: sanitizeName(message.name, `Player ${playerNumber}`),
        hand: [],
        socket
      };

      socket.playerId = player.id;
      socket.roomId = currentRoom.id;

      currentRoom.players.push(player);

      if (currentRoom.players.length === 2 && currentRoom.status === "waiting") {
        startGame(currentRoom);
      }

      broadcastState(currentRoom);
      return;
    }

    if (!socket.roomId || !socket.playerId || !currentRoom || currentRoom.id !== socket.roomId) {
      sendError(socket, "You are not in a room.");
      return;
    }

    if (currentRoom.status !== "playing") {
      sendError(socket, "The game is not active.");
      return;
    }

    const player = findPlayer(currentRoom, socket.playerId);
    if (!player) {
      sendError(socket, "Player not found.");
      return;
    }

    if (message.type === "play_attack") {
      const card = takeCardFromHand(player, message.cardId);
      const defender = findPlayer(currentRoom, currentRoom.defenderId);

      if (!card || player.id !== currentRoom.attackerId) {
        if (card) player.hand.push(card);
        sendError(socket, "Invalid attack.");
        return;
      }

      if (currentRoom.phase !== "attacking" && currentRoom.phase !== "taking") {
        player.hand.push(card);
        sendError(socket, "You cannot attack right now.");
        return;
      }

      const piles = currentRoom.table.piles;
      const tableHasAttacks = piles.length > 0;
      const ranks = ranksOnTable(currentRoom);

      if (tableHasAttacks && !ranks.has(card.rank)) {
        player.hand.push(card);
        sendError(socket, "Attack cards must match a rank on the table.");
        return;
      }

      if (!tableHasAttacks && defender && currentRoom.roundLimit === null) {
        currentRoom.roundLimit = defender.hand.length;
      }

      const attackLimit = getAttackLimit(currentRoom);
      if (piles.length >= attackLimit) {
        player.hand.push(card);
        sendError(socket, "No more attacks allowed this round.");
        return;
      }

      piles.push({ id: generateId(8), attack: card, defense: null });
      broadcastState(currentRoom);
      return;
    }

    if (message.type === "play_defense") {
      if (currentRoom.phase !== "attacking") {
        sendError(socket, "Defense is not allowed now.");
        return;
      }

      const pile = currentRoom.table.piles.find((entry) => entry.id === message.pileId);
      if (!pile || pile.defense) {
        sendError(socket, "That attack is already defended.");
        return;
      }

      if (player.id !== currentRoom.defenderId) {
        sendError(socket, "Only the defender can play defense.");
        return;
      }

      const defenseCard = takeCardFromHand(player, message.cardId);
      if (!defenseCard) {
        sendError(socket, "Card not in hand.");
        return;
      }

      if (!canBeat(pile.attack, defenseCard, currentRoom.trumpSuit)) {
        player.hand.push(defenseCard);
        sendError(socket, "That card does not beat the attack.");
        return;
      }

      pile.defense = defenseCard;
      broadcastState(currentRoom);
      return;
    }

    if (message.type === "transfer") {
      if (!currentRoom.settings.perevod) {
        sendError(socket, "Transfers are disabled.");
        return;
      }

      if (currentRoom.phase !== "attacking") {
        sendError(socket, "Transfers are not allowed now.");
        return;
      }

      if (player.id !== currentRoom.defenderId) {
        sendError(socket, "Only the defender can transfer.");
        return;
      }

      if (currentRoom.table.piles.length === 0 || currentRoom.table.piles.some((pile) => pile.defense)) {
        sendError(socket, "Transfers are only allowed before any defense.");
        return;
      }

      const transferCard = takeCardFromHand(player, message.cardId);
      if (!transferCard) {
        sendError(socket, "Card not in hand.");
        return;
      }

      const ranks = ranksOnTable(currentRoom);
      if (!ranks.has(transferCard.rank)) {
        player.hand.push(transferCard);
        sendError(socket, "Transfer card must match a rank on the table.");
        return;
      }

      const incomingDefenderId = currentRoom.attackerId;
      const incomingDefender = findPlayer(currentRoom, incomingDefenderId);
      const maxPairs = getMaxPairs(currentRoom);
      const newLimit = Math.min(incomingDefender ? incomingDefender.hand.length : 0, maxPairs);

      if (currentRoom.table.piles.length >= newLimit) {
        player.hand.push(transferCard);
        sendError(socket, "No more attacks allowed for the next defender.");
        return;
      }

      currentRoom.table.piles.push({ id: generateId(8), attack: transferCard, defense: null });

      const previousAttacker = currentRoom.attackerId;
      currentRoom.attackerId = currentRoom.defenderId;
      currentRoom.defenderId = previousAttacker;
      currentRoom.roundLimit = newLimit;

      broadcastState(currentRoom);
      return;
    }

    if (message.type === "take") {
      if (player.id !== currentRoom.defenderId) {
        sendError(socket, "Only the defender can take.");
        return;
      }

      if (currentRoom.table.piles.length === 0) {
        sendError(socket, "There is nothing to take.");
        return;
      }

      if (currentRoom.phase === "taking") {
        sendError(socket, "You have already chosen to take.");
        return;
      }

      currentRoom.phase = "taking";
      if (currentRoom.roundLimit === null) {
        currentRoom.roundLimit = player.hand.length;
      }

      broadcastState(currentRoom);
      return;
    }

    if (message.type === "end_turn") {
      if (player.id !== currentRoom.attackerId) {
        sendError(socket, "Only the attacker can end the turn.");
        return;
      }

      const piles = currentRoom.table.piles;
      if (piles.length === 0) {
        sendError(socket, "There are no cards on the table.");
        return;
      }

      if (currentRoom.phase === "taking") {
        const defender = findPlayer(currentRoom, currentRoom.defenderId);
        if (!defender) {
          sendError(socket, "Defender not found.");
          return;
        }

        defender.hand.push(...collectTableCards(currentRoom));
        currentRoom.table.piles = [];

        const attackerId = currentRoom.attackerId;
        const defenderId = currentRoom.defenderId;
        drawToSix(currentRoom, [attackerId, defenderId]);

        currentRoom.phase = "attacking";
        currentRoom.roundLimit = null;

        checkGameEnd(currentRoom);
        broadcastState(currentRoom);
        return;
      }

      if (piles.some((pile) => !pile.defense)) {
        sendError(socket, "All attacks must be defended before ending the turn.");
        return;
      }

      currentRoom.discard.push(...collectTableCards(currentRoom));
      currentRoom.table.piles = [];

      const oldAttacker = currentRoom.attackerId;
      const oldDefender = currentRoom.defenderId;
      drawToSix(currentRoom, [oldAttacker, oldDefender]);

      currentRoom.attackerId = oldDefender;
      currentRoom.defenderId = oldAttacker;
      currentRoom.phase = "attacking";
      currentRoom.roundLimit = null;

      checkGameEnd(currentRoom);
      broadcastState(currentRoom);
      return;
    }

    sendError(socket, "Unknown action.");
  });

  socket.on("close", () => {
    if (!currentRoom || socket.roomId !== currentRoom.id) return;

    const index = currentRoom.players.findIndex((player) => player.id === socket.playerId);
    if (index !== -1) {
      currentRoom.players.splice(index, 1);
    }

    if (currentRoom.players.length === 0) {
      currentRoom = null;
      return;
    }

    resetRoom(currentRoom);
    broadcastState(currentRoom);
  });
});

server.listen(PORT, () => {
  console.log(`Durak server listening on port ${PORT}`);
});
