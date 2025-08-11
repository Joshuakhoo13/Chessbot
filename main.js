var board = null;
var game = new Chess();

// Piece values in centipawns
var PIECE_VALUE = {
    'p': 100,
    'n': 320,
    'b': 330,
    'r': 500,
    'q': 900,
    'k': 0  // King value handled separately in king safety
};

function on_drag_start (source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if (game.game_over()) return false;

    // only pick up pieces for the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function on_drop (source, target) {
    // see if the move is legal
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) return 'snapback';

    update_status();
    
    // After human move, let AI play if it's black's turn
    if (game.turn() === 'b' && !game.game_over()) {
        setTimeout(function() {
            make_ai_move();
        }, 500); // Small delay to see the human move first
    }
}

// update the board position after the piece snap
// for castling, en passant, pawn promotion
function on_snap_end () {
    board.position(game.fen());
}

function update_status () {
    var status = '';

    var move_color = 'White';
    if (game.turn() === 'b') {
        move_color = 'Black';
    }

    // checkmate?
    if (game.in_checkmate()) {
        status = 'Game over, ' + move_color + ' is in checkmate.';
    }

    // draw?
    else if (game.in_draw()) {
        status = 'Game over, drawn position';
    }

    // game still on
    else {
        status = move_color + ' to move';

        // check?
        if (game.in_check()) {
            status += ', ' + move_color + ' is in check';
        }
    }

    $('#status').html(status);
    $('#fen').html(game.fen());
    $('#pgn').html(game.pgn());
}

function make_ai_move() {
    var best_move = get_best_move(game, 3, 'b');
    if (best_move) {
        game.move(best_move);
        board.position(game.fen());
        update_status();
    }
}

function get_best_move(game_state, depth, color) {
    var moves = game_state.moves();
    if (moves.length == 0) {
        return null;
    } else if (color == 'b') {
        var best_move = null;
        var best_value = Number.POSITIVE_INFINITY;
        moves.sort((a, b) => score_move(b, game_state) - score_move(a, game_state));

        for (var i = 0; i < moves.length; i++) {
            var game_clone = new Chess(game_state.fen());
            game_clone.move(moves[i]);
            var curr = minimax(game_clone, depth - 1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true);
            if (curr < best_value) {
                best_value = curr;
                best_move = moves[i];
            }
        }
        return best_move;
    } else {
        var best_move = null;
        var best_value = Number.NEGATIVE_INFINITY;

        for (var i = 0; i < moves.length; i++) {
            var game_clone = new Chess(game_state.fen());
            game_clone.move(moves[i]);
            var curr = minimax(game_clone, depth - 1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, false);
            if (curr > best_value) {
                best_value = curr;
                best_move = moves[i];
            }
        }
        return best_move;
    }
}

var cache = {};

function score_move(move, game_state) {
    var game_clone = new Chess(game_state.fen());
    var m = game_clone.move(move);
    var score = 0;
    if (m.captured) {
        var captured_piece = m.captured;
        var attacking_piece = m.piece;
        score += PIECE_VALUE[captured_piece] - PIECE_VALUE[attacking_piece];
    }
    if (game_clone.in_checkmate()) {
        score += 100000;
    } else if (game_clone.in_check()) {
        score += 300;
    }
    if (m.promotion) {
        score += 500;
    }
    return score;
}

function minimax(game_state, depth, alpha, beta, maximising) {
    if (depth === 0 || game_state.game_over()) {
        return evaluate(game_state);
    } else {
        var moves = game_state.moves();
        if (maximising) {
            var max_eval = Number.NEGATIVE_INFINITY;
            for (var i = 0; i < moves.length; i++) {
                var game_copy = new Chess(game_state.fen());
                game_copy.move(moves[i]);
                var fen = game_copy.fen();
                if (cache[fen] && cache[fen].depth >= depth) {
                    var cached_eval = cache[fen].eval;
                    max_eval = Math.max(max_eval, cached_eval);
                    alpha = Math.max(alpha, cached_eval);
                    if (beta <= alpha) {
                        break;
                    }
                } else {
                    var curr_eval = minimax(game_copy, depth - 1, alpha, beta, false);
                    cache[fen] = {eval: curr_eval, depth: depth};
                    max_eval = Math.max(max_eval, curr_eval);
                    alpha = Math.max(alpha, curr_eval);
                    if (beta <= alpha) {
                        break;
                    }
                }
            }
            return max_eval;
        }
        else {
            var min_eval = Number.POSITIVE_INFINITY;
            for (var i = 0; i < moves.length; i++) {
                var game_copy = new Chess(game_state.fen());
                game_copy.move(moves[i]);
                var fen = game_copy.fen();
                if (cache[fen] && cache[fen].depth >= depth) {
                    var cached_eval = cache[fen].eval;
                    min_eval = Math.min(min_eval, cached_eval);
                    beta = Math.min(beta, cached_eval);
                    if (beta <= alpha) {
                        break;
                    }
                } else {
                    var curr_eval = minimax(game_copy, depth - 1, alpha, beta, true);
                    cache[fen] = {eval: curr_eval, depth: depth};
                    min_eval = Math.min(min_eval, curr_eval);
                    beta = Math.min(beta, curr_eval);
                    if (beta <= alpha) {
                        break;
                    }
                }
            }
            return min_eval;
        }
    }
}


function evaluate(game_state) {
    
    // Piece-square tables (a8=0 to h1=63, from black's perspective)
    var PST = {
        'p': [
            0,   0,   0,   0,   0,   0,   0,   0,
            78,  83,  86,  73, 102,  82,  85,  90,
            7,  29,  21,  44,  40,  31,  44,   7,
            -17,  16,  -2,  15,  14,   0,  15, -13,
            -26,   3,  10,   9,   6,   1,   0, -23,
            -22,   9,   5, -11, -10,  -2,   3, -19,
            -31,   8,  -7, -37, -36, -14,   3, -31,
            0,   0,   0,   0,   0,   0,   0,   0
        ],
        'n': [
            -66, -53, -75, -75, -10, -55, -58, -70,
            -3,  -6, 100, -36,   4,  62,  -4, -14,
            10,  67,   1,  74,  73,  27,  62,  -2,
            24,  24,  45,  37,  33,  41,  25,  17,
            -1,   5,  31,  21,  22,  35,   2,   0,
            -18,  10,  13,  22,  18,  15,  11, -14,
            -23, -15,   2,   0,   2,   0, -23, -20,
            -74, -23, -26, -24, -19, -35, -22, -69
        ],
        'b': [
            -59, -78, -82, -76, -23,-107, -37, -50,
            -11,  20,  35, -42, -39,  31,   2, -22,
            -9,  39, -32,  41,  52, -10,  28, -14,
            25,  17,  20,  34,  26,  25,  15,  10,
            13,  10,  17,  23,  17,  16,   0,   7,
            14,  25,  24,  15,   8,  25,  20,  15,
            19,  20,  11,   6,   7,   6,  20,  16,
            -7,   2, -15, -12, -14, -15, -10, -10
        ],
        'r': [
            35,  29,  33,   4,  37,  33,  56,  50,
            55,  29,  56,  67,  55,  62,  34,  60,
            19,  35,  28,  33,  45,  27,  25,  15,
            0,   5,  16,  13,  18,  -4,  -9,  -6,
            -28, -35, -16, -21, -13, -29, -46, -30,
            -42, -28, -42, -25, -25, -35, -26, -46,
            -53, -38, -31, -26, -29, -43, -44, -53,
            -30, -24, -18,   5,  -2, -18, -31, -32
        ],
        'q': [
            6,   1,  -8,-104,  69,  24,  88,  26,
            14,  32,  60, -10,  20,  76,  57,  24,
            -2,  43,  32,  60,  72,  63,  43,   2,
            1, -16,  22,  17,  25,  20, -13,  -6,
            -14, -15,  -2,  -5,  -1, -10, -20, -22,
            -30,  -6, -13, -11, -16, -11, -16, -27,
            -36, -18,   0, -19, -15, -15, -21, -38,
            -39, -30, -31, -13, -31, -36, -34, -42
        ],
        'k': [
            4,  54,  47, -99, -99,  60,  83, -62,
            -32,  10,  55,  56,  56,  55,  10,   3,
            -62,  12, -57,  44, -67,  28,  37, -31,
            -55,  50,  11,  -4, -19,  13,   0, -49,
            -55, -43, -52, -28, -51, -47,  -8, -50,
            -47, -42, -43, -79, -64, -32, -29, -32,
            -4,   3, -14, -50, -57, -18,  13,   4,
            17,  30,  -3, -14,   6,  -1,  40,  18
        ]
    };

    var material_score = 0;
    var positional_score = 0;
    var king_safety_score = 0;
    var board_state = game_state.board();
    
    // Helper function to convert rank/file to PST index
    function get_pst_index(rank, file, is_white) {
        if (is_white) {
            // For white, flip the board (rank 7 becomes 0, rank 0 becomes 7)
            return (7 - rank) * 8 + file;
        } else {
            // For black, use normal indexing
            return rank * 8 + file;
        }
    }
    
    // Find kings for safety evaluation
    var white_king_pos = null;
    var black_king_pos = null;
    
    // Evaluate each square
    for (var rank = 0; rank < 8; rank++) {
        for (var file = 0; file < 8; file++) {
            var piece = board_state[rank][file];
            if (piece != null) {
                var piece_type = piece.type;
                var is_white = piece.color === 'w';
                
                // MATERIAL EVALUATION
                var piece_value = PIECE_VALUE[piece_type];
                if (is_white) {
                    material_score += piece_value;
                } else {
                    material_score -= piece_value;
                }
                
                // POSITIONAL EVALUATION (PST)
                var pst_index = get_pst_index(rank, file, is_white);
                var position_value = PST[piece_type][pst_index];
                if (is_white) {
                    positional_score += position_value;
                } else {
                    positional_score -= position_value;
                }
                
                // TRACK KING POSITIONS for safety evaluation
                if (piece_type === 'k') {
                    if (is_white) {
                        white_king_pos = {rank: rank, file: file};
                    } else {
                        black_king_pos = {rank: rank, file: file};
                    }
                }
            }
        }
    }
    
    // KING SAFETY EVALUATION
    king_safety_score += evaluate_king_safety(board_state, white_king_pos, true);
    king_safety_score -= evaluate_king_safety(board_state, black_king_pos, false);
    
    // Combine all evaluation components
    var total_score = material_score + positional_score + king_safety_score;
    
    return total_score;
}

function evaluate_king_safety(board_state, king_pos, is_white) {
    if (!king_pos) return 0;
    
    var safety_score = 0;
    var king_rank = king_pos.rank;
    var king_file = king_pos.file;
    
    // Check squares around the king
    for (var dr = -1; dr <= 1; dr++) {
        for (var df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue; // Skip king's own square
            
            var check_rank = king_rank + dr;
            var check_file = king_file + df;
            
            // Check if square is within board
            if (check_rank >= 0 && check_rank < 8 && check_file >= 0 && check_file < 8) {
                var piece = board_state[check_rank][check_file];
                
                if (piece && piece.color === (is_white ? 'w' : 'b')) {
                    // Friendly piece provides protection
                    safety_score += 10;
                } else if (!piece) {
                    // Empty square around king is slightly dangerous
                    safety_score -= 5;
                }
            }
        }
    }
    
    // Bonus for king on back rank (safer)
    var back_rank = is_white ? 7 : 0;
    if (king_rank === back_rank) {
        safety_score += 20;
    }
    
    // Penalty for king in center (more exposed)
    if (king_rank >= 2 && king_rank <= 5 && king_file >= 2 && king_file <= 5) {
        safety_score -= 30;
    }
    
    return safety_score;
}

var board = new Chessboard('first_board', {
    draggable: true,
    position: 'start',
    onDragStart: on_drag_start,
    onDrop: on_drop,
    onSnapEnd: on_snap_end,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
});

update_status();

