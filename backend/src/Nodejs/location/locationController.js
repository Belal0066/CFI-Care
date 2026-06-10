const locationService = require("./locationService");

const getAllLocations = async (req, res) => {
  try {
    const locations = await locationService.getAllLocations();
    res.status(200).json(locations);
  } catch (error) {
    console.error("Error in getAllLocations controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getLocationsByOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const locations =
      await locationService.getLocationsByOrganization(organizationId);
    res.status(200).json(locations);
  } catch (error) {
    console.error(
      "Error in getLocationsByOrganization controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createLocationWithSpecificId = async (req, res) => {
  try {
    const locationData = req.body;
    const newLocation =
      await locationService.createLocationWithSpecificId(locationData);
    console.log("New location created successfully.");
    res.status(201).json(newLocation);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createLocation = async (req, res) => {
  try {
    const locationData = req.body;
    const newLocation = await locationService.createLocation(locationData);
    console.log("New location created successfully.");
    res.status(201).json(newLocation);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getLocationById = async (req, res) => {
  try {
    const { id } = req.params;
    const location = await locationService.getLocationById(id);
    res.status(200).json(location);
  } catch (error) {
    console.error("Error in getLocationById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const locationData = req.body;
    const updatedLocation = await locationService.updateLocation(
      id,
      locationData,
    );
    res.status(200).json(updatedLocation);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await locationService.deleteLocation(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllLocations,
  getLocationsByOrganization,
  getLocationById,
  createLocationWithSpecificId,
  createLocation,
  updateLocation,
  deleteLocation,
};
