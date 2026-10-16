module.exports = async () => {
  await globalThis.__POSTGRES__?.stop();
};
