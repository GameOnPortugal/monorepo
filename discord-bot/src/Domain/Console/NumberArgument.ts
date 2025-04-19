import AbstractInputArgument from './AbstractInputArgument'

export default class NumberArgument extends AbstractInputArgument {
  getValue (): number | undefined {
    return super.getValue() as number | undefined
  }
}
