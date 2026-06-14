// const Joi = require('joi');

// const loginSchema = Joi.object({
//   email: Joi.string()
//     .email()
//     .required()
//     .max(255)
//     .messages({
//       'string.email': 'Please provide a valid email address',
//       'string.empty': 'Email is required',
//       'any.required': 'Email is required'
//     }),
//   password: Joi.string()
//     .required()
//     .min(8)
//     .max(128)
//     .messages({
//       'string.empty': 'Password is required',
//       'string.min': 'Password must be at least 8 characters',
//       'any.required': 'Password is required'
//     })
// });

// const registerSchema = Joi.object({
//   email: Joi.string()
//     .email()
//     .required()
//     .max(255)
//     .messages({
//       'string.email': 'Please provide a valid email address',
//       'string.empty': 'Email is required',
//       'any.required': 'Email is required'
//     }),
//   password: Joi.string()
//     .required()
//     .min(8)
//     .max(128)
//     .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
//     .messages({
//       'string.empty': 'Password is required',
//       'string.min': 'Password must be at least 8 characters',
//       'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
//       'any.required': 'Password is required'
//     }),
//   fullName: Joi.string()
//     .required()
//     .max(200)
//     .pattern(/^[a-zA-Z\s'-]+$/)
//     .messages({
//       'string.empty': 'Full name is required',
//       'string.pattern.base': 'Full name can only contain letters, spaces, hyphens, and apostrophes',
//       'any.required': 'Full name is required'
//     })
// });

// const validate = (schema) => {
//   return (req, res, next) => {
//     const { error, value } = schema.validate(req.body, {
//       abortEarly: false,
//       stripUnknown: true 
//     });

//     if (error) {
//       const errors = error.details.map(detail => ({
//         field: detail.path[0],
//         message: detail.message
//       }));
//       return res.status(400).json({
//         error: 'Validation failed',
//         details: errors
//       });
//     }

//     // Replace req.body with sanitized values
//     req.body = value;
//     next();
//   };
// };

// module.exports = {
//   validateLogin: validate(loginSchema),
//   validateRegister: validate(registerSchema)
// };
