export class ControllingRequestError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ControllingRequestError';
  }
}
