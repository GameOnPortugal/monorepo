import AbstractInputArgument from './AbstractInputArgument'

export default class StringArgument extends AbstractInputArgument {
  getValue (): string | undefined {
    return super.getValue() as string | undefined
  }
}
