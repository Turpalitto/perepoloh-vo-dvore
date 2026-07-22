/** Минимальные полифиллы для заявленной поддержки ранних Safari/iOS. */
if (!Object.entries) {
  Object.entries = function entries<T extends object>(value: T): [string, T[keyof T]][] {
    return Object.keys(value).map((key) => [key, value[key as keyof T]]);
  } as ObjectConstructor['entries'];
}

if (!Object.values) {
  Object.values = function values<T extends object>(value: T): T[keyof T][] {
    return Object.keys(value).map((key) => value[key as keyof T]);
  } as ObjectConstructor['values'];
}

if (!Element.prototype.closest) {
  Element.prototype.closest = function closest(selector: string): Element | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- полифилл closest обязан ходить по this
    let element: Element | null = this;
    while (element) {
      if (element.matches(selector)) return element;
      element = element.parentElement;
    }
    return null;
  };
}
