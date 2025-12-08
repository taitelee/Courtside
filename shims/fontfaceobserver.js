// Simple shim for fontfaceobserver to avoid dependency issues on web
// This provides a minimal implementation that expo-font can use
export default class FontFaceObserver {
  constructor(family, options) {
    this.family = family;
    this.options = options || {};
  }
  
  load(text, timeout) {
    // Return a resolved promise immediately - fonts will load naturally
    return Promise.resolve(this);
  }
}

