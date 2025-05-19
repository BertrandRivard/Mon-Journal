// hashPassword.js
const bcrypt = require('bcrypt');

const password = 'test'; // Remplacez par le mot de passe souhaité
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Erreur lors du hachage:', err);
    return;
  }
  console.log('Mot de passe haché:', hash);
});