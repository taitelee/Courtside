// Shared io instance to avoid circular dependencies
let io = null;

function setIO(ioInstance) {
  io = ioInstance;
}

function getIO() {
  return io;
}

module.exports = { setIO, getIO };
