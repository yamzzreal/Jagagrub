const fs = require('fs');

const addSaldo = (userId, amount, _dir) => {
  let position = null;
  Object.keys(_dir).forEach((x) => {
    if (_dir[x].id === userId) {
      position = x;
    }
  });
  if (position !== null) {
    _dir[position].saldo += amount;
  } else {
    _dir.push({ id: userId, saldo: amount });
  }
  fs.writeFileSync('./source/saldo.json', JSON.stringify(_dir, null, 3));
};

const minSaldo = (userId, amount, _dir) => {
  let position = null;
  Object.keys(_dir).forEach((x) => {
    if (_dir[x].id === userId) {
      position = x;
    }
  });
  if (position !== null) {
    _dir[position].saldo -= amount;
    fs.writeFileSync('./source/saldo.json', JSON.stringify(_dir, null, 3));
  }
};

const cekSaldo = (userId, _dir) => {
  let position = null;
  Object.keys(_dir).forEach((x) => {
    if (_dir[x].id === userId) {
      position = x;
    }
  });
  return position !== null ? _dir[position].saldo : 0;
};

// FUNGSI BARU

// Menampilkan semua ID dan saldo pengguna
const listSaldo = (_dir) => {
  return _dir.map((user, index) => `${index + 1}. ID: ${user.id} - Saldo: ${user.saldo}`).join('\n');
};

// Mereset saldo pengguna menjadi 0
const resetSaldo = (userId, _dir) => {
  let position = null;
  Object.keys(_dir).forEach((x) => {
    if (_dir[x].id === userId) {
      position = x;
    }
  });
  if (position !== null) {
    _dir[position].saldo = 0;
    fs.writeFileSync('./source/saldo.json', JSON.stringify(_dir, null, 3));
  }
};

module.exports = { addSaldo, minSaldo, cekSaldo, listSaldo, resetSaldo };