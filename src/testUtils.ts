/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable unicorn/prevent-abbreviations */

/**
 * Casts the input function or method to be a jest.MockedFunction. This is especially
 * useful for a mock that was created using jest.mock and of which the mock is imported
 * normally from the module path. It helps to let TypeScript know that the input
 * function is a mock and also keep the original function signature while using a mock
 * to get proper type hinting.
 *
 * @param fn The mocked function or method
 * @returns {jest.MockedFunction}
 */
export function mockedFn<T extends (...args: any[]) => any >(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}
