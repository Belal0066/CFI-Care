const Joi = require("joi");

const createPatientSchema = Joi.object({
  firstName: Joi.string().min(2).required(),

  lastName: Joi.string().min(2).required(),

  email: Joi.string().email().required(),

  birthDate: Joi.string().isoDate().required(),

  password: Joi.string().min(8).required(),
}).unknown(true); // allow extra fields so validation is permissive

module.exports = {
  createPatientSchema,
};
