class Value<T> {
  value: T;
  hasValue: boolean;

  static of<T>(value: T) {
    return new Known(value);
  }

  static unknown() {
    return new Unknown();
  }

  chain(mappingFunction: (value: T) => Value<T>) {
    if (this.hasValue) {
      return mappingFunction(this.value);
    }
    return this;
  }
}

class Known<T> extends Value<T> {
  constructor(value: T) {
    super();
    this.value = value;
    this.hasValue = true;
  }
}

class Unknown<T> extends Value<T> {}

export { Value };
