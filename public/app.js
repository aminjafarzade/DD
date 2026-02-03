const elements = {
  screenHome: document.getElementById("screen-home"),
  screenLobby: document.getElementById("screen-lobby"),
  screenGame: document.getElementById("screen-game"),
  screenFinished: document.getElementById("screen-finished"),
  createName: document.getElementById("create-name"),
  joinName: document.getElementById("join-name"),
  joinRoom: document.getElementById("join-room"),
  togglePerevod: document.getElementById("toggle-perevod"),
  btnCreate: document.getElementById("btn-create"),
  btnJoin: document.getElementById("btn-join"),
  shareLink: document.getElementById("share-link"),
  btnCopy: document.getElementById("btn-copy"),
  lobbyStatus: document.getElementById("lobby-status"),
  trumpInfo: document.getElementById("trump-info"),
  deckInfo: document.getElementById("deck-info"),
  discardInfo: document.getElementById("discard-info"),
  statusText: document.getElementById("status-text"),
  table: document.getElementById("table"),
  hand: document.getElementById("hand"),
  opponentRow: document.getElementById("opponent-row"),
  youRow: document.getElementById("you-row"),
  btnTake: document.getElementById("btn-take"),
  btnEnd: document.getElementById("btn-end"),
  actionHint: document.getElementById("action-hint"),
  btnNew: document.getElementById("btn-new"),
  resultTitle: document.getElementById("result-title"),
  resultSubtitle: document.getElementById("result-subtitle"),
  roomInfo: document.getElementById("room-info"),
  toast: document.getElementById("toast")
};

const SUIT_SYMBOL = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣"
};

let socket = null;
let currentState = null;
let selectedCardId = null;
let draggingCardId = null;

function showScreen(screen) {
  const screens = [elements.screenHome, elements.screenLobby, elements.screenGame, elements.screenFinished];
  screens.forEach((el) => el.classList.remove("active"));
  screen.classList.add("active");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function wsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

function sendMessage(type, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type, ...payload }));
}

function connectToRoom(roomId, name) {
  if (socket) {
    socket.close();
  }

  socket = new WebSocket(wsUrl());

  socket.addEventListener("open", () => {
    sendMessage("join", { roomId, name });
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "state") {
      currentState = data;
      updateView();
    }

    if (data.type === "error") {
      showToast(data.message || "Something went wrong.");
      if (!currentState) {
        showScreen(elements.screenHome);
      }
    }
  });

  socket.addEventListener("close", () => {
    showToast("Disconnected from server.");
  });
}

function updateRoomInfo() {
  if (!currentState) return;
  const perevodLabel = currentState.settings.perevod ? "Perevod: On" : "Perevod: Off";
  elements.roomInfo.textContent = `Room ${currentState.roomId} · ${perevodLabel}`;
}

function updateLobbyLink() {
  if (!currentState) return;
  const link = `${window.location.origin}?room=${currentState.roomId}`;
  elements.shareLink.value = link;
}

function updateView() {
  if (!currentState) return;

  updateRoomInfo();

  if (currentState.status === "waiting") {
    updateLobbyLink();
    elements.lobbyStatus.textContent = "Waiting for player 2 to join";
    showScreen(elements.screenLobby);
    return;
  }

  if (currentState.status === "finished") {
    showFinished();
    return;
  }

  showScreen(elements.screenGame);
  renderGame();
}

function showFinished() {
  showScreen(elements.screenFinished);
  const result = currentState.result || {};
  if (result.outcome === "draw") {
    elements.resultTitle.textContent = "It\'s a draw";
    elements.resultSubtitle.textContent = "Both players finished without cards.";
    return;
  }

  if (result.outcome === "win") {
    const winner = currentState.players.find((player) => player.id === result.winnerId);
    const isYou = result.winnerId === currentState.youId;
    elements.resultTitle.textContent = isYou ? "You win!" : "You lose";
    elements.resultSubtitle.textContent = winner ? `${winner.name} finished first.` : "Game complete.";
    return;
  }

  elements.resultTitle.textContent = "Game Over";
  elements.resultSubtitle.textContent = "Thanks for playing.";
}

function renderGame() {
  const you = currentState.players.find((player) => player.id === currentState.youId);
  const opponent = currentState.players.find((player) => player.id !== currentState.youId);

  renderPlayerRow(elements.youRow, you, true);
  renderPlayerRow(elements.opponentRow, opponent, false);

  renderInfo();
  renderTable();
  renderHand();
  renderActions();
}

function renderInfo() {
  const trumpCard = currentState.trumpCard;
  if (trumpCard) {
    const symbol = SUIT_SYMBOL[trumpCard.suit] || "?";
    elements.trumpInfo.textContent = `${symbol} ${trumpCard.rank}`;
  } else {
    elements.trumpInfo.textContent = "-";
  }

  elements.deckInfo.textContent = String(currentState.deckCount);
  elements.discardInfo.textContent = String(currentState.discardCount);

  const role = currentState.youId === currentState.attackerId ? "Attacking" : "Defending";
  elements.statusText.textContent = `${role}`;
}

function renderPlayerRow(container, player, isYou) {
  container.innerHTML = "";

  const meta = document.createElement("div");
  meta.className = "player-meta";

  const name = document.createElement("div");
  name.className = "player-name";
  name.textContent = player ? player.name : "Waiting...";

  const role = document.createElement("div");
  role.className = "player-role";
  if (!player) {
    role.textContent = "";
  } else if (player.id === currentState.attackerId) {
    role.textContent = "Attacking";
  } else if (player.id === currentState.defenderId) {
    role.textContent = "Defending";
  } else {
    role.textContent = "";
  }

  meta.appendChild(name);
  meta.appendChild(role);

  const count = document.createElement("div");
  count.className = "hand-count";
  if (player) {
    count.textContent = `${player.handCount} card${player.handCount === 1 ? "" : "s"}`;
  } else {
    count.textContent = "";
  }

  container.appendChild(meta);
  container.appendChild(count);
}

function renderTable() {
  elements.table.innerHTML = "";

  const selectedCard = getSelectedCard();
  const canDefend = currentState.actionHints.canDefend;

  currentState.table.piles.forEach((pile) => {
    const pileEl = document.createElement("div");
    pileEl.className = "pile";

    const attackCardEl = createCardElement(pile.attack, true);
    attackCardEl.style.zIndex = "1";
    attackCardEl.dataset.pileId = pile.id;
    attackCardEl.classList.add("attack-card");

    if (selectedCard && canDefend && canBeat(pile.attack, selectedCard, currentState.trumpSuit)) {
      attackCardEl.classList.add("target");
    }

    attackCardEl.addEventListener("click", () => {
      handleDefenseAttempt(pile);
    });

    attackCardEl.addEventListener("dragover", (event) => {
      const dragged = getDraggedCard(event);
      if (!dragged) return;
      if (!currentState.actionHints.canDefend) return;
      if (!canBeat(pile.attack, dragged, currentState.trumpSuit)) return;
      event.preventDefault();
      event.stopPropagation();
      attackCardEl.classList.add("drop-target");
    });

    attackCardEl.addEventListener("dragleave", () => {
      attackCardEl.classList.remove("drop-target");
    });

    attackCardEl.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      attackCardEl.classList.remove("drop-target");
      const dragged = getDraggedCard(event);
      if (!dragged) return;
      sendMessage("play_defense", { pileId: pile.id, cardId: dragged.id });
      selectedCardId = null;
    });

    pileEl.appendChild(attackCardEl);

    if (pile.defense) {
      const defenseCardEl = createCardElement(pile.defense, false);
      defenseCardEl.classList.add("defense");
      defenseCardEl.style.zIndex = "2";
      pileEl.appendChild(defenseCardEl);
    }

    elements.table.appendChild(pileEl);
  });
}

function renderHand() {
  elements.hand.innerHTML = "";

  if (!currentState) return;

  const yourHand = sortHand(currentState.yourHand, currentState.trumpSuit);
  if (!currentState.yourHand.find((card) => card.id === selectedCardId)) {
    selectedCardId = null;
  }

  yourHand.forEach((card) => {
    const cardEl = createCardElement(card, true);
    cardEl.classList.add("selectable");
    cardEl.setAttribute("draggable", "true");
    cardEl.draggable = true;

    if (card.id === selectedCardId) {
      cardEl.classList.add("selected");
    }

    cardEl.addEventListener("click", () => handleHandCardClick(card));
    cardEl.addEventListener("dragstart", (event) => {
      draggingCardId = card.id;
      selectedCardId = card.id;
      renderTable();
      renderHand();
      renderActions();
      updateDragPreview(card);
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", card.id);
        event.dataTransfer.effectAllowed = "move";
      }
      cardEl.classList.add("dragging");
    });

    cardEl.addEventListener("dragend", () => {
      draggingCardId = null;
      cardEl.classList.remove("dragging");
      elements.table.classList.remove("drag-over");
      elements.table.classList.remove("drag-transfer");
      selectedCardId = null;
      renderTable();
      renderActions();
    });
    elements.hand.appendChild(cardEl);
  });
}

function renderActions() {
  const hints = currentState.actionHints;

  elements.btnTake.disabled = !hints.canTake;
  elements.btnEnd.disabled = !hints.canEndTurn;

  elements.btnTake.textContent = hints.canTake ? "Take Cards" : "Take";
  elements.btnEnd.textContent = hints.canEndTurn ? "Finish Turn" : "End Turn";

  const hintText = buildActionHint(hints);
  elements.actionHint.textContent = hintText;
}

function handleHandCardClick(card) {
  const hints = currentState.actionHints;

  if (hints.canAttack && currentState.youId === currentState.attackerId) {
    sendMessage("play_attack", { cardId: card.id });
    selectedCardId = null;
    return;
  }

  if (hints.canDefend || hints.canTransfer) {
    selectedCardId = card.id;
    renderTable();
    renderHand();
    renderActions();
  }
}

function handleDefenseAttempt(pile) {
  const hints = currentState.actionHints;
  if (!hints.canDefend) return;

  const selectedCard = getSelectedCard();
  if (!selectedCard) return;

  if (!canBeat(pile.attack, selectedCard, currentState.trumpSuit)) {
    showToast("That card cannot beat the attack.");
    return;
  }

  sendMessage("play_defense", { pileId: pile.id, cardId: selectedCard.id });
  selectedCardId = null;
}

function createCardElement(card, showDetails) {
  const cardEl = document.createElement("div");
  cardEl.className = "playing-card";

  if (!showDetails) {
    cardEl.classList.add("back");
    cardEl.textContent = "D";
    return cardEl;
  }

  if (card.suit === "hearts" || card.suit === "diamonds") {
    cardEl.classList.add("red");
  }

  const corner = document.createElement("div");
  corner.className = "corner corner-top";

  const rank = document.createElement("div");
  rank.className = "rank";
  rank.textContent = card.rank;

  const suit = document.createElement("div");
  suit.className = "suit";
  suit.textContent = SUIT_SYMBOL[card.suit] || "?";

  corner.appendChild(rank);
  corner.appendChild(suit);

  const cornerBottom = corner.cloneNode(true);
  cornerBottom.classList.remove("corner-top");
  cornerBottom.classList.add("corner-bottom");

  cardEl.appendChild(corner);
  cardEl.appendChild(cornerBottom);

  return cardEl;
}

function getSelectedCard() {
  if (!currentState || !selectedCardId) return null;
  return currentState.yourHand.find((card) => card.id === selectedCardId) || null;
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

function getDraggedCard(event) {
  if (!currentState) return null;
  const cardId = event && event.dataTransfer ? event.dataTransfer.getData("text/plain") : null;
  const resolvedId = cardId || draggingCardId || selectedCardId;
  if (!resolvedId) return null;
  return currentState.yourHand.find((card) => card.id === resolvedId) || null;
}

function sortHand(hand, trumpSuit) {
  const suitOrder = ["spades", "hearts", "diamonds", "clubs"];
  return [...hand].sort((a, b) => {
    const aTrump = a.suit === trumpSuit;
    const bTrump = b.suit === trumpSuit;
    if (aTrump !== bTrump) return aTrump ? -1 : 1;

    if (a.suit !== b.suit) {
      return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    }

    return b.value - a.value;
  });
}

function buildActionHint(hints) {
  if (currentState.youId === currentState.attackerId) {
    if (hints.canAttack) {
      return "Drag a card to the table or click it to attack.";
    }
    if (hints.canEndTurn) {
      return "All attacks defended. Finish the turn.";
    }
  }

  if (currentState.youId === currentState.defenderId) {
    if (hints.canDefend && hints.canTransfer) {
      return "Drag a matching rank to transfer or drag onto an attack to defend.";
    }
    if (hints.canDefend) {
      return "Drag a card onto an attack to defend.";
    }
    if (hints.canTake) {
      return "Take the cards if you cannot defend.";
    }
  }

  return "";
}

function updateDragPreview(card) {
  if (!currentState || !card) return;

  const hints = currentState.actionHints;
  const canTransfer =
    hints.canTransfer && currentState.table.piles.some((pile) => pile.attack.rank === card.rank);
  const canAttack = hints.canAttack;

  elements.table.classList.toggle("drag-over", canAttack || canTransfer);
  elements.table.classList.toggle("drag-transfer", canTransfer);
}

async function createGame() {
  const perevod = elements.togglePerevod.checked;
  const response = await fetch("/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ perevod })
  });

  const data = await response.json();
  if (!response.ok) {
    showToast(data.error || "Failed to create room.");
    return;
  }

  const name = elements.createName.value.trim() || "Player 1";
  connectToRoom(data.roomId, name);
  elements.shareLink.value = `${window.location.origin}?room=${data.roomId}`;
  elements.lobbyStatus.textContent = "Waiting for player 2 to join";
  showScreen(elements.screenLobby);
}

function joinGame() {
  const roomId = elements.joinRoom.value.trim().toUpperCase();
  if (!roomId) {
    showToast("Enter a room code.");
    return;
  }

  const name = elements.joinName.value.trim() || "Player 2";
  connectToRoom(roomId, name);
  showScreen(elements.screenLobby);
}

elements.btnCreate.addEventListener("click", createGame);

elements.btnJoin.addEventListener("click", joinGame);

elements.btnCopy.addEventListener("click", () => {
  if (!elements.shareLink.value) return;
  navigator.clipboard.writeText(elements.shareLink.value).then(() => {
    showToast("Link copied!");
  });
});

elements.btnTake.addEventListener("click", () => {
  sendMessage("take");
});

elements.btnEnd.addEventListener("click", () => {
  sendMessage("end_turn");
});

elements.btnNew.addEventListener("click", () => {
  window.location.href = "/";
});

(function setupDragTargets() {
  elements.table.addEventListener("dragover", (event) => {
    const dragged = getDraggedCard(event);
    if (!dragged) return;

    const hints = currentState ? currentState.actionHints : null;
    if (!hints) return;

    const canTransfer =
      hints.canTransfer && currentState.table.piles.some((pile) => pile.attack.rank === dragged.rank);
    const canAttack = hints.canAttack;

    if (!canAttack && !canTransfer) return;
    event.preventDefault();
    elements.table.classList.add("drag-over");
    elements.table.classList.toggle("drag-transfer", canTransfer);
  });

  elements.table.addEventListener("dragleave", () => {
    elements.table.classList.remove("drag-over");
    elements.table.classList.remove("drag-transfer");
  });

  elements.table.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.table.classList.remove("drag-over");
    elements.table.classList.remove("drag-transfer");
    const dragged = getDraggedCard(event);
    if (!dragged || !currentState) return;

    const hints = currentState.actionHints;
    const canTransfer =
      hints.canTransfer && currentState.table.piles.some((pile) => pile.attack.rank === dragged.rank);

    if (hints.canAttack) {
      sendMessage("play_attack", { cardId: dragged.id });
      selectedCardId = null;
      return;
    }

    if (canTransfer) {
      sendMessage("transfer", { cardId: dragged.id });
      selectedCardId = null;
      return;
    }

    showToast("That card cannot be played there.");
  });

  elements.table.addEventListener("click", () => {
    const selectedCard = getSelectedCard();
    if (!selectedCard || !currentState) return;

    const hints = currentState.actionHints;
    const canTransfer =
      hints.canTransfer && currentState.table.piles.some((pile) => pile.attack.rank === selectedCard.rank);

    if (hints.canAttack) {
      sendMessage("play_attack", { cardId: selectedCard.id });
      selectedCardId = null;
      return;
    }

    if (canTransfer) {
      sendMessage("transfer", { cardId: selectedCard.id });
      selectedCardId = null;
    }
  });
})();

(function init() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    elements.joinRoom.value = roomParam.toUpperCase();
    showScreen(elements.screenHome);
  }
})();
