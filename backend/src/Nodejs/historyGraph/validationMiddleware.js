const express = require("express");
const {
  validateNodeData,
  buildErrorResponse,
  ALLOWED_CATEGORIES,
  ALLOWED_PRIORITIES,
  ALLOWED_NORMALITIES,
  RELATIONSHIP_TYPES,
} = require("./historyGraphService");

/**
 * Validation middleware for node creation/update requests
 */
function validateAddNodeRequest(req, res, next) {
  const { nodeData, parentNodeId } = req.body;

  if (!nodeData) {
    return res
      .status(400)
      .json(
        buildErrorResponse(
          { nodeData: "nodeData is required in request body" },
          400,
        ),
      );
  }

  try {
    validateNodeData(nodeData);

    // Additional validation for relationshipType if provided
    if (
      nodeData.relationshipType &&
      !Array.from(
        typeof RELATIONSHIP_TYPES === "function"
          ? [
              "association",
              "documents",
              "derives_from",
              "follows",
              "references",
              "contains",
              "causes",
            ]
          : RELATIONSHIP_TYPES,
      ).includes(nodeData.relationshipType)
    ) {
      return res.status(400).json(
        buildErrorResponse(
          {
            relationshipType:
              "Invalid relationshipType. Allowed: association, documents, derives_from, follows, references, contains, causes",
          },
          400,
        ),
      );
    }

    next();
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(buildErrorResponse(err.errors));
    }
    res.status(400).json(buildErrorResponse({ nodeData: err.message }, 400));
  }
}

/**
 * Validation middleware for pagination/filter parameters
 */
function validateGraphQuery(req, res, next) {
  const { limit, offset, category, priority, normality, dateFrom, dateTo } =
    req.query;
  const errors = {};

  if (limit && (isNaN(limit) || parseInt(limit) < 1)) {
    errors.limit = "limit must be a positive integer";
  }
  if (offset && (isNaN(offset) || parseInt(offset) < 0)) {
    errors.offset = "offset must be a non-negative integer";
  }
  if (category && !ALLOWED_CATEGORIES.has(category)) {
    errors.category = `Invalid category. Allowed: ${Array.from(ALLOWED_CATEGORIES).join(", ")}`;
  }
  if (priority && !ALLOWED_PRIORITIES.has(priority)) {
    errors.priority = `Invalid priority. Allowed: ${Array.from(ALLOWED_PRIORITIES).join(", ")}`;
  }
  if (normality && !ALLOWED_NORMALITIES.has(normality)) {
    errors.normality = `Invalid normality. Allowed: ${Array.from(ALLOWED_NORMALITIES).join(", ")}`;
  }
  if (dateFrom && isNaN(Date.parse(dateFrom))) {
    errors.dateFrom = "dateFrom must be a valid ISO 8601 date";
  }
  if (dateTo && isNaN(Date.parse(dateTo))) {
    errors.dateTo = "dateTo must be a valid ISO 8601 date";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json(buildErrorResponse(errors, 400));
  }

  next();
}

/**
 * Global error handler for service errors
 */
function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  // Service-thrown validation errors
  if (err.statusCode) {
    return res.status(err.statusCode).json(buildErrorResponse(err.errors));
  }

  // String errors
  if (typeof err === "string") {
    return res.status(400).json(buildErrorResponse({ error: err }, 400));
  }

  // Default server error
  res
    .status(500)
    .json(
      buildErrorResponse(
        { error: "Internal server error", detail: err.message },
        500,
      ),
    );
}

module.exports = {
  validateAddNodeRequest,
  validateGraphQuery,
  errorHandler,
};
