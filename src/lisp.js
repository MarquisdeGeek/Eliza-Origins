// BUGWARN: This was vibe coded!
function tokenize(input) {
  return input
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/);
}

function parse(tokens) {
  const expressions = [];

  while (tokens.length > 0) {
    expressions.push(parseExpr(tokens));
  }

  return expressions;
}

function parseExpr(tokens) {
  if (tokens.length === 0) throw new Error("Unexpected EOF");

  const token = tokens.shift();

  if (token === '(') {
    const list = [];
    while (tokens[0] !== ')') {
      list.push(parseExpr(tokens));
      if (tokens.length === 0) throw new Error("Unexpected EOF (missing ')')");
    }
    tokens.shift(); // remove ')'
    return list;
  } else if (token === ')') {
    throw new Error("Unexpected ')'");
  } else {
    return atom(token);
  }
}

function atom(token) {
  if (!isNaN(token)) {
    return Number(token);
  }
  return token;
}

function parseList(text) {
    return parse(tokenize(text));
}

module.exports = {
    parseList
}
