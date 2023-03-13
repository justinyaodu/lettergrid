import { useRef, useState } from "react";
import { Alert, Button, Form, FormControl } from "react-bootstrap";
import rawDictionary from "./dictionary.json";

const validWords = new Set(rawDictionary);

interface TileSet {
  readonly tileScores: Record<string, number>;
}

interface Square {
  readonly letterMultiplier: number;
  readonly wordMultiplier: number;
}

interface PlacedTile {
  readonly tile: string;
  readonly letter: string;
}

interface TilePlacement {
  readonly tile: PlacedTile;
  readonly row: number;
  readonly col: number;
}

interface Move {
  readonly tiles: TilePlacement[];
  readonly words: string[];
  readonly points: number;
}

interface Player {
  readonly name: string;
}

interface Game {
  readonly useDictionary: boolean;
  readonly checkTilePlacement: boolean;
  readonly squares: Square[][];
  readonly tiles: (PlacedTile | null)[][];
  readonly tileSet: TileSet;
  readonly players: Player[];
  readonly moves: Move[];
}

function parseSquare(square: string): Square {
  switch (square) {
    case "d": return { letterMultiplier: 2, wordMultiplier: 1 };
    case "t": return { letterMultiplier: 3, wordMultiplier: 1 };
    case "D": return { letterMultiplier: 1, wordMultiplier: 2 };
    case "T": return { letterMultiplier: 1, wordMultiplier: 3 };
    default: return { letterMultiplier: 1, wordMultiplier: 1 };
  }
}

function parseSquares(squares: string): Square[][] {
  return squares.split(/\s+/).filter((line) => line.length > 0).map((line) => Array.from(line).map(parseSquare));
}

function setPlayers(game: Game, players: Player[]): Game {
  return { ...game, players };
}

function newGame(): Game {
  const squares = parseSquares(scrabbleBoard);
  const tiles = squares.map((row) => row.map((square) => null));
  return {
    useDictionary: true,
    checkTilePlacement: true,
    tileSet: scrabbleTileSet,
    squares,
    tiles,
    players: [],
    moves: [],
  }
}

function intervalsIntersect(start1: number, end1: number, start2: number, end2: number): boolean {
  return !(end1 < start2 || end2 < start1);
}

function rectanglesIntersect(rect1: [number, number, number, number], rect2: [number, number, number, number]) {
  const [minRow1, minCol1, maxRow1, maxCol1] = rect1;
  const [minRow2, minCol2, maxRow2, maxCol2] = rect2;
  return intervalsIntersect(minRow1, maxRow1, minRow2, maxRow2) && intervalsIntersect(minCol1, maxCol1, minCol2, maxCol2)
}

function makeMove(game: Game, tilePlacements: TilePlacement[]): Game | string {
  if (tilePlacements.length === 0) {
    // Pass.
    return {
      ...game,
      moves: [...game.moves, { tiles: [], words: [], points: 0 }]
    };
  }

  for (const tilePlacement of tilePlacements) {
    if (!(tilePlacement.tile.letter in game.tileSet.tileScores) && tilePlacement.tile.letter !== " ") {
      return `Invalid tile: ${JSON.stringify(tilePlacement.tile.letter)}`;
    }
  }

  // Not checking if tiles overlap with existing tiles - the UI should prevent this.

  const newTiles = game.tiles.map((row) => row.map((tile) => tile));
  for (const tilePlacement of tilePlacements) {
    newTiles[tilePlacement.row][tilePlacement.col] = tilePlacement.tile;
  }

  const minRow = Math.min(...tilePlacements.map((p) => p.row));
  const maxRow = Math.max(...tilePlacements.map((p) => p.row));
  const minCol = Math.min(...tilePlacements.map((p) => p.col));
  const maxCol = Math.max(...tilePlacements.map((p) => p.col));

  if (game.checkTilePlacement) {
    if (tilePlacements.length > 7) {
      return "Cannot place more than 7 tiles";
    }

    if (minRow !== maxRow && minCol !== maxCol) {
      return "Tiles must be placed in a line";
    }

    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        if (newTiles[i][j] === null) {
          return "Gaps between tiles are not allowed";
        }
      }
    }

    // TODO: first move should be more than 1 letter and should touch the middle of the board

    let touching = false;
    for (let i = minRow; i <= maxRow; i++) {
      if (minCol - 1 >= 0 && newTiles[i][minCol - 1] !== null) {
        touching = true;
      }
      if (maxCol + 1 < newTiles[i].length && newTiles[i][maxCol + 1] !== null) {
        touching = true;
      }
    }
    for (let j = minCol; j <= maxCol; j++) {
      if (minRow - 1 >= 0 && newTiles[minRow - 1][j] !== null) {
        touching = true;
      }
      if (maxRow + 1 < newTiles.length && newTiles[maxRow + 1][j] !== null) {
        touching = true;
      }
    }
    if (!touching && game.tiles.some((row) => row.some((tile) => tile !== null))) {
      return "Tiles must touch existing tiles";
    }
  }

  // Find all constructed words.
  const allWordRects: [number, number, number, number][] = [];
  for (let i = 0; i < newTiles.length; i++) {
    let range: [number, number] | null = null;
    for (let j = 0; j <= newTiles[i].length; j++) {
      const tile = (j === newTiles[i].length) ? null : newTiles[i][j];
      if (tile === null) {
        if (range !== null && range[1] - range[0] > 0) {
          allWordRects.push([i, range[0], i, range[1]]);
        }
        range = null;
      } else {
        range = (range === null) ? [j, j] : [range[0], j];
      }
    }
  }
  for (let j = 0; j < newTiles[0].length; j++) {
    let range: [number, number] | null = null;
    for (let i = 0; i <= newTiles.length; i++) {
      const tile = (i === newTiles.length) ? null : newTiles[i][j];
      if (tile === null) {
        if (range !== null && range[1] - range[0] > 0) {
          allWordRects.push([range[0], j, range[1], j]);
        }
        range = null;
      } else {
        range = (range === null) ? [i, i] : [range[0], i];
      }
    }
  }

  const newWordRects = allWordRects.filter((word) => tilePlacements.some((p) => rectanglesIntersect(word, [p.row, p.col, p.row, p.col])));

  const words = [];
  let points = 0;
  for (const [startRow, startCol, endRow, endCol] of newWordRects) {
    let letters = [];
    let letterPoints = 0;
    let wordMultiplier = 1;
    for (let i = startRow; i <= endRow; i++) {
      for (let j = startCol; j <= endCol; j++) {
        const tile = newTiles[i][j];
        if (tile === null) {
          return `Internal error: null tile at ${i},${j}`;
        }
        letters.push(tile.letter);

        let letterMultiplier = 1;
        if (game.tiles[i][j] === null) {
          wordMultiplier *= game.squares[i][j].wordMultiplier;
          letterMultiplier = game.squares[i][j].letterMultiplier;
        }
        letterPoints += letterMultiplier * game.tileSet.tileScores[tile.tile];
      }
    }
    words.push(letters.join(""));
    points += letterPoints * wordMultiplier;
  }

  if (tilePlacements.length === 7) {
    points += 50;
  }

  if (game.useDictionary) {
    const invalidWords = words.filter((word) => !validWords.has(word));
    if (invalidWords.length > 0) {
      return "Words are not valid: " + invalidWords.join(", ");
    }
  }

  return {
    ...game,
    tiles: newTiles,
    moves: [...game.moves, {
      tiles: tilePlacements,
      words,
      points,
    }]
  }
}

function undo(game: Game): Game {
  if (game.moves.length === 0) {
    return game;
  }

  const newTiles = game.tiles.map((row) => row.map((tile) => tile));
  for (const tilePlacement of game.moves[game.moves.length - 1].tiles) {
    newTiles[tilePlacement.row][tilePlacement.col] = null;
  }

  return {
    ...game,
    tiles: newTiles,
    moves: game.moves.slice(0, -1),
  };
}

const scrabbleBoard = `
T..d...T...d..T
.D...t...t...D.
..D...d.d...D..
d..D...d...D..d
....D.....D....
.t...t...t...t.
..d...d.d...d..
T..d...D...d..T
..d...d.d...d..
.t...t...t...t.
....D.....D....
d..D...d...D..d
..D...d.d...D..
.D...t...t...D.
T..d...T...d..T
`;

const scrabbleTileSet = {
  tileScores: {
    " ": 0,
    "a": 1,
    "b": 3,
    "c": 3,
    "d": 2,
    "e": 1,
    "f": 4,
    "g": 2,
    "h": 4,
    "i": 1,
    "j": 8,
    "k": 5,
    "l": 1,
    "m": 3,
    "n": 1,
    "o": 1,
    "p": 3,
    "q": 10,
    "r": 1,
    "s": 1,
    "t": 1,
    "u": 1,
    "v": 4,
    "w": 4,
    "x": 8,
    "y": 4,
    "z": 10,
  }
}

function squareColor(square: Square): string {
  if (square.letterMultiplier === 2) {
    return "#c0e0ff";
  }
  else if (square.letterMultiplier === 3) {
    return "#0080ff";
  }
  else if (square.wordMultiplier === 2) {
    return "#ffc0c0";
  }
  else if (square.wordMultiplier === 3) {
    return "#ff4040";
  }
  return "#fffff";
}

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function BoardCellInput({ onValueChange, onArrowKey }: { onValueChange: (text: string) => void, onArrowKey: (text: ArrowKey) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input ref={ref} className={`BoardCellInput ${value === "" ? "" : "pending"}`}
      type="text" pattern="[A-Za-z]?" maxLength={1}
      onChange={(event) => {
        const newValue = event.target.value;
        setValue(newValue);
        onValueChange(newValue);
      }}
      onKeyDown={(event) => {
        const key = event.key;

        // Make TypeScript happy.
        if (ref.current === null) {
          return;
        }

        if (key === "ArrowUp"
          || key === "ArrowDown"
          || key === "ArrowLeft"
          || key === "ArrowRight") {
          onArrowKey(key);
          event.preventDefault();
        }
      }}
    />
  );
}

function BoardCell({ game, square, tile, onValueChange, onArrowKey }: { game: Game, square: Square, tile: PlacedTile | null, onValueChange: (text: string) => void, onArrowKey: (key: ArrowKey) => void }) {
  return (
    <td className="BoardCell" style={{ backgroundColor: squareColor(square) }}>
      {
        tile === null
          ? (
            <BoardCellInput onValueChange={onValueChange} onArrowKey={onArrowKey} />
          )
          : (<div className="tile">
            <span>{
              tile.tile === " " ? tile.letter.toUpperCase() : tile.letter
            }</span>
            <div className="tilePoints">{game.tileSet.tileScores[tile.tile]}</div>
          </div>
          )
      }
    </td>
  );
}

type SetGame = (game: Game) => void;

function Board({ game, setGame }: { game: Game, setGame: SetGame }) {
  const [tilePlacements, setTilePlacements] = useState<TilePlacement[]>([]);
  const [error, setError] = useState("");

  const tableRef = useRef<HTMLTableSectionElement>(null);

  const onCellChange = (row: number, col: number, text: string) => {
    const newTilePlacements = tilePlacements.filter((p) => p.row !== row || p.col !== col);
    if (text.length > 0) {
      newTilePlacements.push({
        tile: {
          letter: text.toLowerCase(),
          tile: (text.toLowerCase() === text) ? text : " ",
        },
        row,
        col,
      })
    }
    setTilePlacements(newTilePlacements);
  };

  const onArrowKey = (row: number, col: number, key: ArrowKey) => {
    // Find the next empty cell in the specified direction, if one exists.

    const dx = { ArrowUp: 0, ArrowDown: 0, ArrowLeft: -1, ArrowRight: 1 }[key];
    const dy = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: 0, ArrowRight: 0 }[key];

    let targetRow = row + dy;
    let targetCol = col + dx;
    const inRange = () => (
      0 <= targetRow && targetRow < game.tiles.length
      && 0 <= targetCol && targetCol < game.tiles[0].length
    );

    while (inRange() && game.tiles[targetRow][targetCol] !== null) {
      targetRow += dy;
      targetCol += dx;
    }

    if (!inRange()) {
      return;
    }

    // This is super nasty, but I don't want to bother with refs...
    if (tableRef.current !== null) {
      const child = tableRef.current.children[targetRow].children[targetCol].querySelector("input") as HTMLInputElement;
      child.focus();
      child.setSelectionRange(0, child.value.length, "forward");
    }
  };

  const doMove = (pass: boolean) => {
    if (!pass && tilePlacements.length === 0) {
      setError("No tiles placed");
      return;
    }
    else if (pass && tilePlacements.length > 0) {
      setError("Cannot place tiles when passing");
      return;
    }
    const result = makeMove(game, tilePlacements);
    if (typeof result === "string") {
      setError(result);
    } else {
      console.log({
        player: getPlayerForMove(result, result.moves.length - 1)?.name || "unknown",
        words: result.moves[result.moves.length - 1].words.join("/"),
      });
      console.log(JSON.stringify(result));
      setError("");
      setGame(result);
      setTilePlacements([]);
    }
  }

  return (
    <div className="me-3">
      <table className="Board mb-3">
        <tbody ref={tableRef}>
          {game.squares.map((row, i) => (<tr key={i}>{
            row.map((square, j) => (
              <BoardCell key={j} game={game} square={square} tile={game.tiles[i][j]}
                onValueChange={(text) => onCellChange(i, j, text)}
                onArrowKey={(key) => onArrowKey(i, j, key)}
              />
            ))
          }</tr>
          ))
          }
        </tbody>
      </table>
      <div className="BoardButtons mb-3">
        <Button onClick={() => doMove(false)}>Play</Button>
        <Button variant="outline-secondary" onClick={() => doMove(true)}>Pass</Button>
        <Button variant="outline-danger" onClick={() => setGame(undo(game))}>Undo</Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  )
}

function Setup({ game, setGame }: { game: Game, setGame: SetGame }) {
  return (
    <Form className="Setup mb-3">
      <h2>Setup</h2>
      <Form.Group>
        <Form.Label htmlFor="players">{"Player names (space separated, starting with the first player to move)"}</Form.Label>
        <FormControl id="players" placeholder="for example: John Paul George Ringo" onChange={(event) => {
          setGame(setPlayers(game, event.target.value.split(/\s+/).filter((s) => s.length > 0).map((name) => ({ name }))))
        }}></FormControl>
      </Form.Group>
      <Form.Check id="use-dictionary" type="checkbox" label="Use dictionary to reject invalid words" checked={game.useDictionary} onChange={(e) => setGame({ ...game, useDictionary: e.target.checked })} />
      <Form.Check id="check-tile-placement" type="checkbox" label="Enforce tile placement rules" checked={game.checkTilePlacement} onChange={(e) => setGame({ ...game, checkTilePlacement: e.target.checked })} />
    </Form>
  );
}

function getPlayerForMove(game: Game, move: number): Player | null {
  if (game.players.length === 0) {
    return null;
  }
  return game.players[move % game.players.length];
}

function getScoresByPlayer(game: Game): Record<string, number> {
  const scoreByPlayer = game.players.length === 0 ? { "unknown": 0 } : Object.fromEntries(game.players.map((p) => [p.name, 0]));
  game.moves.forEach((move, i) => {
    const player = getPlayerForMove(game, i);
    const playerName = player === null ? "unknown" : player.name;
    scoreByPlayer[playerName] += move.points;
  });
  return scoreByPlayer;
}

function Scoreboard({ game }: { game: Game }) {
  const scoreByPlayer = Object.entries(getScoresByPlayer(game));
  scoreByPlayer.sort(([name1, score1], [name2, score2]) => score2 - score1);

  return (
    <div>
      <h2>Scoreboard</h2>
      <ol>
        {scoreByPlayer.map(([name, score], i) => (
          <li key={i}>{`${name}: ${score}`}</li>
        ))}
      </ol>
    </div>
  )
}

function Moves({ game }: { game: Game }) {
  return (
    <div>
      <h2>Moves</h2>
      <ol>
        {game.moves.map((move, i) => (
          <li key={i}>
            {(getPlayerForMove(game, i)?.name || "unknown") + (move.words.length === 0 ? " passed" : ` played ${move.words.join("/")} for ${move.points} points`)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Debug({ game, setGame }: { game: Game, setGame: SetGame }) {
  const [text, setText] = useState("");
  return (
    <div className="Debug mb-3">
      <h2>Load Saved Game</h2>
      <p>After each move, a save file for your game is printed to your browser console in JSON format. You can copy a save, then paste it here and click "Load" to restore your progress.</p>
      <div className="mb-3">
        <textarea onChange={(event) => setText(event.target.value)} />
      </div>
      <Button onClick={() => setGame(JSON.parse(text))}>Load</Button>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState(newGame());
  return (
    <div className="p-3">
      <h1>Scrabble Scoring Tool</h1>
      <p>Automatically calculate each player's score during a Scrabble game.</p>
      <Setup game={game} setGame={setGame} />
      <h2>Board</h2>
      <p>For each turn, type in the tiles placed and click "Play" below. Use lowercase for normal tiles and uppercase for blank tiles.</p>
      <div className="Game">
        <Board game={game} setGame={setGame}></Board>
        <div>
          <Scoreboard game={game} />
          <Moves game={game} />
        </div>
      </div>
      <Debug game={game} setGame={setGame} />
      <h2>About</h2>
      <p>Made somewhat hastily by Justin. Check out the source code on <a href="https://github.com/justinyaodu/lettergrid">GitHub</a>.</p>
    </div>
  );
}
