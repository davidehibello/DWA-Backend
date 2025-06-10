const express = require("express");
const router = express.Router();
const Job = require("../models/Job");
const { 
  getSkillsForCategory, 
  getSalaryRangeForCategory, 
  getDescriptionForCategory,
  NOC_CATEGORIES, 
  getMedianSalaryForCategory
} = require("../services/jobService");

// GET /api/jobs?page=1&limit=20
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find({}).sort({ post_date: -1 });
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs." });
  }
});

// GET /api/jobs/categories
router.get("/categories", async (req, res) => {
  try {
    // Aggregate jobs by category and count
    const categoryAggregation = await Job.aggregate([
      {
        $group: {
          _id: { category: "$category", sector: "$sector" },
          count: { $sum: 1 },
          nocCodes: { $addToSet: "$noc_code" },
          naicsCodes: { $addToSet: "$naics_code" }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Transform the data to match the format expected by the frontend
    let categoryId = 1;
    const result = categoryAggregation.map(item => {
      const category = item._id.category || 'Other';
      const sector = item._id.sector || 'Other';
      
      return {
        id: categoryId++,
        name: category,
        count: item.count,
        sector: sector,
        description: getDescriptionForCategory(category, sector),
        skills: getSkillsForCategory(category),
        salary: getSalaryRangeForCategory(category),
        medianSalary: getMedianSalaryForCategory(category),
        // Add the NOC and NAICS codes for the bubble details
        nocCodes: item.nocCodes.filter(Boolean),
        naicsCodes: item.naicsCodes.filter(Boolean),
        // Generate related flag based on category similarity
        isRelated: Math.random() > 0.7 // This would be improved with real relatedness logic
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error("Error fetching job categories:", error);
    res.status(500).json({ error: "Failed to fetch job categories." });
  }
});

// GET /api/jobs/categories/:categoryName
router.get("/categories/:categoryName", async (req, res) => {
  try {
    const { categoryName } = req.params;
    
    // Find jobs in this category
    const jobs = await Job.find({ category: categoryName })
      .sort({ post_date: -1 })
      .limit(20);
    
    if (jobs.length === 0) {
      return res.status(404).json({ error: "Category not found or has no jobs" });
    }
    
    // Get the first job to extract sector
    const sector = jobs[0].sector || 'Other';
    
    const categoryDetail = {
      name: categoryName,
      count: jobs.length,
      sector: sector,
      description: getDescriptionForCategory(categoryName, sector),
      skills: getSkillsForCategory(categoryName),
      salary: getSalaryRangeForCategory(categoryName),
      medianSalary: getMedianSalaryForCategory(categoryName),
      // Add the NOC and NAICS codes
      nocCodes: [...new Set(jobs.map(job => job.noc_code).filter(Boolean))],
      naicsCodes: [...new Set(jobs.map(job => job.naics_code).filter(Boolean))],
      jobs: jobs.map(job => ({
        id: job._id,
        title: job.job_title,
        employer: job.employer,
        location: job.region ? `${job.region}, ${job.stateprov}` : job.stateprov,
        postDate: job.post_date,
        url: job.url,
        type: job.type
      }))
    };
    
    res.json(categoryDetail);
  } catch (error) {
    console.error("Error fetching category detail:", error);
    res.status(500).json({ error: "Failed to fetch category detail." });
  }
});

// Manual trigger for job fetching (for testing, visit the following link to immediately pull jobs; 
// perfect for testing the validity of new attributes: http://localhost:3000/api/jobs/latest)
router.get("/fetch", async (req, res) => {
  try {
    console.log("Manual job fetch triggered");
    const { saveJobs } = require("../services/jobService");
    await saveJobs();
    res.json({ success: true, message: "Jobs fetched and saved successfully" });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs." });
  }
});
// New route - GET /api/jobs/search?query=developer
router.get("/search", async (req, res) => {
  const { query } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const searchQuery = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { company: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    };

    const jobs = await Job.find(searchQuery)
      .sort({ post_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Job.countDocuments(searchQuery);

    res.json({
      jobs,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error searching jobs:", error);
    res.status(500).json({ error: "Failed to search jobs." });
  }
});

// Return jobs with coordinates - Jobs map feature
router.get("/map", async (req, res) => {
  try {
    const jobs = await Job.find(
      {
        $or: [
          { latitude: { $ne: null }, longitude: { $ne: null } }, // ✅ Check for new lat/lng format
          { "derived_location.lat": { $exists: true }, "derived_location.lon": { $exists: true } } // ✅ Fallback for older data
        ]
      },
      {
        job_title: 1,
        employer: 1,
        post_date: 1,
        url: 1,
        latitude: 1,
        longitude: 1,
        "derived_location.lat": 1, // Include derived_location.lat
        "derived_location.lon": 1, // Include derived_location.lon
      }
    );

    // ✅ Ensure the response always contains lat/lng
    const formattedJobs = jobs.map(job => {

      const title = job.job_title.toLowerCase();
      let job_type = "Other";

      if (title.includes("full time")) job_type = "FT";
      else if (title.includes("part time")) job_type = "PT";
      else if (title.includes("casual")) job_type = "Casual";

      return {
        _id: job._id,
        job_title: job.job_title,
        employer: job.employer,
        post_date: job.post_date,
        url: job.url,
        latitude: job.latitude || job.derived_location?.lat, // Use lat if available, fallback to derived_location.lat
        longitude: job.longitude || job.derived_location?.lon, // Use lon if available, fallback to derived_location.lon
        job_type,
      }
    });

    res.json({ jobs: formattedJobs });
  } catch (error) {
    console.error("Error fetching jobs for map:", error);
    res.status(500).json({ error: "Failed to fetch jobs for the map." });
  }
});


module.exports = router;