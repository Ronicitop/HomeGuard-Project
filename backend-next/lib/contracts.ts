import Ajv from "ajv/dist/2020";
import formats from "ajv-formats";
import detection from "../../contracts/schemas/detection-proposed.schema.json";
const ajv = new Ajv({ allErrors: true, strict: true });
formats(ajv);
const validators = { "detection-proposed": ajv.compile(detection) };
export function validateContract(
  name: string,
  payload: unknown,
): { valid: boolean; errors: unknown } {
  const validate = validators[name as keyof typeof validators];
  if (!validate)
    return { valid: false, errors: [{ message: "Unknown contract" }] };
  return { valid: Boolean(validate(payload)), errors: validate.errors || [] };
}
