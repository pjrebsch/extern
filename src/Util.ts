export function callerStack(ignore: Function, limit?: number) {
  const trace: { stack: NonNullable<Error["stack"]> } = { stack: "" };

  const originalLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = limit ?? originalLimit;
  Error.captureStackTrace(trace, ignore);
  Error.stackTraceLimit = originalLimit;

  const [_message, ...frames] = trace.stack.split("\n");

  return frames.join("\n");
}

export function augmentFunction<
  Fn extends (...args: any[]) => unknown,
  Props extends Record<string, unknown>,
>(fn: Fn, props: Props) {
  const propertyDescriptors = Object.entries(props).map(
    ([k, v]): [keyof Props, PropertyDescriptor] => [
      k,
      { value: v, enumerable: true },
    ],
  );

  const redefined = Object.defineProperties(
    fn,
    Object.fromEntries(propertyDescriptors),
  );

  return redefined as Fn & Props;
}
