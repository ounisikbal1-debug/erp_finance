if (process.env.NODE_ENV === 'production') {
  console.error('npm start lance les serveurs de développement. Utilisez npm run start:production.');
  process.exit(1);
}
