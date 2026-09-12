/**
 * Errors whose text is meant for the person using the app.
 *
 * `runAction` returns the message of a `UserFacingError` to the browser and
 * replaces every other message with one generic sentence. The distinction
 * matters because most of what can be thrown on the server is not written for a
 * reader: a Prisma failure carries constraint names, table names and the query
 * arguments, and those arguments are the food, weight and diet data this
 * application exists to keep on one machine. Throw this class when the sentence
 * is genuinely for the user; throw anything else and the user sees the generic
 * sentence while the server log keeps the detail.
 */
export class UserFacingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    // Subclassing a built-in loses the constructor name under some transpile
    // targets, and `runAction` logs the name, so set it explicitly.
    this.name = 'UserFacingError';
  }
}
