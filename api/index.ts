import app, { createApp, handler } from '../src/app';

export { createApp, handler };
export default app;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(app, {
    createApp,
    handler,
    default: app,
  });
}
