export default abstract class AbstractInputArgument {
  protected value: any

  constructor (
    public name: string,
    public description: string,
    public required: boolean,
    protected defaultValue: number | undefined
  ) {
  }

  setValue (value: any): void {
    this.value = value
  };

  isValid (): boolean {
    return this.required && this.getValue() !== undefined
  };

  getValue (): any {
    return this.value ?? this.defaultValue
  }
}
