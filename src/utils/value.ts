class Value {
  value;
  hasValue;

  static of(value) {
    return new Known(value);
  }

  static unknown() {
    return new Unknown();
  }

  chain(mappingFunction) {
    if (this.hasValue) {
      return mappingFunction(this.value);
    }
    return this;
  }
}

class Known extends Value {
  constructor(value) {
    super();
    this.value = value;
    this.hasValue = true;
  }
}

class Unknown extends Value {}

export { Value };
