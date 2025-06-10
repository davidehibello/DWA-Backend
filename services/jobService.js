const axios = require("axios");
const Job = require("../models/Job");

// Map of NOC codes to category names
// Using 2-digit major group codes for broad categories
const NOC_CATEGORIES = {
  "00": "Senior management",
  "01-05": "Specialized middle management",
  "06-09": "Middle management",
  "11-14": "Professional occupations in business and finance",
  "21-22": "Professional occupations in natural and applied sciences",
  "30-31": "Professional occupations in health",
  "32-34": "Technical and skilled occupations in health",
  "40-42": "Professional occupations in education, law, social and government services",
  "43-44": "Paraprofessional occupations in legal, social and education services",
  "51-52": "Professional occupations in art and culture",
  "53-54": "Technical occupations in art, culture and sport",
  "62-63": "Retail sales supervisors and specialized sales occupations",
  "64-66": "Service supervisors and specialized service occupations",
  "67-68": "Service representatives and other customer service occupations",
  "72-73": "Industrial, electrical and construction trades",
  "74-75": "Maintenance and equipment operation trades",
  "76": "Other installers, repairers and servicers",
  "82-83": "Supervisors and technical occupations in natural resources and agriculture",
  "84-85": "Workers in natural resources and agriculture",
  "86": "Harvesting and landscaping supervisors and laborers",
  "92-93": "Processing, manufacturing and utilities supervisors and central control operators",
  "94-95": "Processing and manufacturing machine operators and assemblers",
  "96": "Laborers in processing, manufacturing and utilities"
};

// Map of NAICS codes to sector names
const NAICS_SECTORS = {
  "11": "Agriculture, forestry, fishing and hunting",
  "21": "Mining, quarrying, and oil and gas extraction",
  "22": "Utilities",
  "23": "Construction",
  "31-33": "Manufacturing",
  "41": "Wholesale trade",
  "44-45": "Retail trade",
  "48-49": "Transportation and warehousing",
  "51": "Information and cultural industries",
  "52": "Finance and insurance",
  "53": "Real estate and rental and leasing",
  "54": "Professional, scientific and technical services",
  "55": "Management of companies and enterprises",
  "56": "Administrative and support, waste management and remediation services",
  "61": "Educational services",
  "62": "Health care and social assistance",
  "71": "Arts, entertainment and recreation",
  "72": "Accommodation and food services",
  "81": "Other services (except public administration)",
  "91": "Public administration"
};

// Function to get category name from NOC code
function getCategoryFromNOC(nocCode) {
  if (!nocCode) return 'Other';
  
  // Get the major group (first 2 digits)
  const majorGroup = nocCode.substring(0, 2);
  
  // Find matching category
  for (const [range, category] of Object.entries(NOC_CATEGORIES)) {
    if (range.includes('-')) {
      const [start, end] = range.split('-');
      if (majorGroup >= start && majorGroup <= end) {
        return category;
      }
    } else if (majorGroup === range) {
      return category;
    }
  }
  
  return 'Other';
}

// Function to get sector from NAICS code
function getSectorFromNAICS(naicsCode) {
  if (!naicsCode) return 'Other';
  
  // Get the sector (first 2 digits)
  const sector = naicsCode.substring(0, 2);
  
  // Find matching sector
  for (const [range, sectorName] of Object.entries(NAICS_SECTORS)) {
    if (range.includes('-')) {
      const [start, end] = range.split('-');
      if (sector >= start && sector <= end) {
        return sectorName;
      }
    } else if (sector === range) {
      return sectorName;
    }
  }
  
  return 'Other';
}

async function fetchJobPostings(page = 1, perPage = 40) {
  try {
    const params = new URLSearchParams();
    params.append("key", process.env.WEDATATOOLS_API_KEY);
    params.append("page", page);
    params.append("per_page", perPage);
    params.append("includes[]", "location");
    params.append("includes[]", "derived_location");
    
    // Include basic job fields
    [
      "job_title",
      "employer",
      "type",
      "excerpt",
      "url",
      "post_date",
      "region",
      "stateprov",
      "harmonized_wage",
      "skill_names",
    ].forEach((field) => {
      params.append("includes[]", field);
    });
    
    // Include NOC and NAICS classification fields
    [
      "nocs_2021",
      "major_group_2021",
      "naics", 
      "sector"
    ].forEach((field) => {
      params.append("includes[]", field);
    });
    
    params.append("orderby", "date_desc");

    const response = await axios.post(
      "https://api.wedatatools.com/v2/get-jobs",
      params
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching job postings:", error);
    throw error;
  }
}

async function saveJobs() {
  const data = await fetchJobPostings(1, 40);
  const jobs = data.hits || [];

  for (const jobHit of jobs) {
    const jobData = jobHit._source;
    
    // Get NOC and NAICS codes
    const nocCode = Array.isArray(jobData.nocs_2021) ? jobData.nocs_2021[0] : jobData.nocs_2021;
    const naicsCode = Array.isArray(jobData.naics) ? jobData.naics[0] : jobData.naics;
    
    // Categorize based on NOC and NAICS
    const category = getCategoryFromNOC(nocCode);
    const sector = getSectorFromNAICS(naicsCode) || jobData.sector || 'Other';
    
    // Add the classification data to the job
    jobData.category = category;
    jobData.sector = sector;
    jobData.noc_code = nocCode;
    jobData.naics_code = naicsCode;
    
    try {
      await Job.findOneAndUpdate(
        { url: jobData.url },
        jobData,
        { upsert: true, new: true }
      );
      console.log(`Saved job: ${jobData.job_title} (Category: ${category}, Sector: ${sector})`);
    } catch (err) {
      console.error("Error saving job:", err);
    }
  }
}

// Generate sample skills for categories
function getSkillsForCategory(category) {
  // Mapping of typical skills by NOC category
  const categorySkills = {
    "Senior management": ['Strategic Planning', 'Leadership', 'Decision Making', 'Business Development', 'Financial Management'],
    "Specialized middle management": ['Project Management', 'Team Leadership', 'Budget Management', 'Strategic Planning', 'Performance Management'],
    "Middle management": ['Team Leadership', 'Operations Management', 'Budget Control', 'Problem Solving', 'Staff Development'],
    "Professional occupations in business and finance": ['Financial Analysis', 'Business Strategy', 'Risk Management', 'Regulatory Compliance', 'Data Analysis'],
    "Professional occupations in natural and applied sciences": ['Research', 'Technical Analysis', 'Problem Solving', 'Project Management', 'Technical Documentation'],
    "Professional occupations in health": ['Patient Care', 'Clinical Assessment', 'Treatment Planning', 'Health Promotion', 'Medical Record Management'],
    "Technical and skilled occupations in health": ['Patient Support', 'Medical Testing', 'Equipment Operation', 'Clinical Procedures', 'Record Keeping'],
    "Professional occupations in education, law, social and government services": ['Curriculum Development', 'Legal Research', 'Policy Analysis', 'Case Management', 'Program Development'],
    "Paraprofessional occupations in legal, social and education services": ['Research Support', 'Client Assessment', 'Documentation', 'Program Implementation', 'Administrative Support'],
    "Professional occupations in art and culture": ['Creative Direction', 'Content Development', 'Artistic Design', 'Production Management', 'Performance'],
    "Technical occupations in art, culture and sport": ['Technical Support', 'Equipment Operation', 'Design Implementation', 'Production Assistance', 'Performance Support'],
    "Retail sales supervisors and specialized sales occupations": ['Customer Service', 'Sales Techniques', 'Inventory Management', 'Staff Supervision', 'Merchandising'],
    "Service supervisors and specialized service occupations": ['Customer Service', 'Team Supervision', 'Quality Assurance', 'Service Delivery', 'Process Improvement'],
    "Service representatives and other customer service occupations": ['Customer Support', 'Problem Resolution', 'Communication', 'Service Delivery', 'Information Provision'],
    "Industrial, electrical and construction trades": ['Technical Skills', 'Equipment Operation', 'Blueprint Reading', 'Installation', 'Troubleshooting'],
    "Maintenance and equipment operation trades": ['Equipment Maintenance', 'Mechanical Repair', 'Troubleshooting', 'Safety Procedures', 'Preventative Maintenance'],
    "Other installers, repairers and servicers": ['Installation', 'Repair', 'Testing', 'Maintenance', 'Customer Service'],
    "Supervisors and technical occupations in natural resources and agriculture": ['Resource Management', 'Team Supervision', 'Technical Operations', 'Safety Oversight', 'Quality Control'],
    "Workers in natural resources and agriculture": ['Equipment Operation', 'Resource Extraction', 'Agricultural Production', 'Physical Labor', 'Safety Procedures'],
    "Harvesting and landscaping supervisors and laborers": ['Landscape Maintenance', 'Equipment Operation', 'Planting', 'Irrigation', 'Team Coordination'],
    "Processing, manufacturing and utilities supervisors and central control operators": ['Process Oversight', 'Quality Control', 'Team Supervision', 'Equipment Monitoring', 'Safety Management'],
    "Processing and manufacturing machine operators and assemblers": ['Machine Operation', 'Quality Inspection', 'Assembly', 'Production Monitoring', 'Technical Procedures'],
    "Laborers in processing, manufacturing and utilities": ['Material Handling', 'Equipment Operation', 'Product Assembly', 'Quality Checking', 'Physical Labor'],
    "Other": ['Communication', 'Teamwork', 'Problem Solving', 'Organization', 'Attention to Detail']
  };
  
  return categorySkills[category] || ['Communication', 'Teamwork', 'Problem Solving', 'Organization', 'Attention to Detail'];
}

// Generate approximate salary ranges for categories
function getSalaryRangeForCategory(category) {
  const salaryRanges = {
    "Senior management": '$100,000 - $200,000+',
    "Specialized middle management": '$85,000 - $150,000',
    "Middle management": '$70,000 - $120,000',
    "Professional occupations in business and finance": '$65,000 - $130,000',
    "Professional occupations in natural and applied sciences": '$70,000 - $140,000',
    "Professional occupations in health": '$75,000 - $200,000',
    "Technical and skilled occupations in health": '$55,000 - $90,000',
    "Professional occupations in education, law, social and government services": '$65,000 - $150,000',
    "Paraprofessional occupations in legal, social and education services": '$45,000 - $80,000',
    "Professional occupations in art and culture": '$50,000 - $100,000',
    "Technical occupations in art, culture and sport": '$40,000 - $85,000',
    "Retail sales supervisors and specialized sales occupations": '$40,000 - $80,000',
    "Service supervisors and specialized service occupations": '$40,000 - $75,000',
    "Service representatives and other customer service occupations": '$35,000 - $60,000',
    "Industrial, electrical and construction trades": '$50,000 - $100,000',
    "Maintenance and equipment operation trades": '$45,000 - $90,000',
    "Other installers, repairers and servicers": '$40,000 - $75,000',
    "Supervisors and technical occupations in natural resources and agriculture": '$50,000 - $95,000',
    "Workers in natural resources and agriculture": '$35,000 - $75,000',
    "Harvesting and landscaping supervisors and laborers": '$35,000 - $65,000',
    "Processing, manufacturing and utilities supervisors and central control operators": '$55,000 - $95,000',
    "Processing and manufacturing machine operators and assemblers": '$40,000 - $75,000',
    "Laborers in processing, manufacturing and utilities": '$35,000 - $65,000'
  };
  
  return salaryRanges[category] || '$40,000 - $80,000';
}

// Extract median value from salary ranges
function getMedianSalaryForCategory(category) {
  const salaryRanges = {
    "Senior management": 150000,
    "Specialized middle management": 117500,
    "Middle management": 95000,
    "Professional occupations in business and finance": 97500,
    "Professional occupations in natural and applied sciences": 105000,
    "Professional occupations in health": 137500,
    "Technical and skilled occupations in health": 72500,
    "Professional occupations in education, law, social and government services": 107500,
    "Paraprofessional occupations in legal, social and education services": 62500,
    "Professional occupations in art and culture": 75000,
    "Technical occupations in art, culture and sport": 62500,
    "Retail sales supervisors and specialized sales occupations": 60000,
    "Service supervisors and specialized service occupations": 57500,
    "Service representatives and other customer service occupations": 47500,
    "Industrial, electrical and construction trades": 75000,
    "Maintenance and equipment operation trades": 67500,
    "Other installers, repairers and servicers": 57500,
    "Supervisors and technical occupations in natural resources and agriculture": 72500,
    "Workers in natural resources and agriculture": 55000,
    "Harvesting and landscaping supervisors and laborers": 50000,
    "Processing, manufacturing and utilities supervisors and central control operators": 75000,
    "Processing and manufacturing machine operators and assemblers": 57500,
    "Laborers in processing, manufacturing and utilities": 50000
  };
  
  return salaryRanges[category] || 60000; // Default median value
}

// Generate descriptions for job categories
function getDescriptionForCategory(category, sector) {
  const descriptions = {
    "Senior management": `Senior management professionals lead organizations and departments, making strategic decisions that guide business operations. They develop policies, manage budgets, and oversee staff in the ${sector} sector.`,
    
    "Specialized middle management": `Specialized middle management professionals oversee specific departments or functions within organizations in the ${sector} sector. They implement strategic initiatives, manage teams, and report to senior executives.`,
    
    "Middle management": `Middle management professionals supervise operational activities and staff in the ${sector} sector. They implement policies, monitor performance, and ensure organizational objectives are met.`,
    
    "Professional occupations in business and finance": `Business and finance professionals provide specialized services such as accounting, financial analysis, human resources, and business consulting in the ${sector} sector. They analyze data, develop reports, and provide strategic recommendations.`,
    
    "Professional occupations in natural and applied sciences": `Natural and applied sciences professionals conduct research, develop new technologies, and solve complex problems in the ${sector} sector. They apply scientific and technical knowledge to advance innovation.`,
    
    "Professional occupations in health": `Health professionals diagnose, treat, and prevent illness and injury in the ${sector} sector. They provide direct patient care, conduct health assessments, and develop treatment plans.`,
    
    "Technical and skilled occupations in health": `Health technicians and skilled practitioners support healthcare delivery in the ${sector} sector. They operate medical equipment, conduct tests, and assist health professionals in patient care.`,
    
    "Professional occupations in education, law, social and government services": `Education, law, social, and government professionals provide specialized services in the ${sector} sector. They teach, provide legal counsel, develop social programs, and implement government policies.`,
    
    "Paraprofessional occupations in legal, social and education services": `Paraprofessionals in legal, social, and education services support professional practitioners in the ${sector} sector. They assist with research, documentation, client services, and program implementation.`,
    
    "Professional occupations in art and culture": `Art and culture professionals create, produce, and promote artistic and cultural works in the ${sector} sector. They express creative vision, develop content, and manage cultural productions.`,
    
    "Technical occupations in art, culture and sport": `Art, culture, and sport technicians provide technical support for creative and athletic activities in the ${sector} sector. They operate equipment, implement designs, and support performances and competitions.`,
    
    "Retail sales supervisors and specialized sales occupations": `Retail and sales professionals manage retail operations and specialized sales functions in the ${sector} sector. They supervise staff, develop merchandising strategies, and optimize sales performance.`,
    
    "Service supervisors and specialized service occupations": `Service supervisors and specialists manage service delivery and perform specialized service functions in the ${sector} sector. They ensure customer satisfaction, supervise staff, and implement service protocols.`,
    
    "Service representatives and other customer service occupations": `Customer service representatives provide direct assistance to customers in the ${sector} sector. They respond to inquiries, resolve issues, and ensure positive customer experiences.`,
    
    "Industrial, electrical and construction trades": `Industrial, electrical, and construction tradespeople build, install, and maintain structures and systems in the ${sector} sector. They apply technical skills to construction, electrical, and industrial projects.`,
    
    "Maintenance and equipment operation trades": `Maintenance and equipment operation tradespeople maintain and operate machinery and equipment in the ${sector} sector. They conduct inspections, perform repairs, and ensure safe and efficient operations.`,
    
    "Other installers, repairers and servicers": `Installers, repairers, and servicers set up, maintain, and fix various equipment and systems in the ${sector} sector. They troubleshoot issues, replace components, and ensure proper functioning.`,
    
    "Supervisors and technical occupations in natural resources and agriculture": `Natural resources and agriculture supervisors and technicians manage and support extraction and production activities in the ${sector} sector. They oversee operations, implement technical procedures, and ensure resource management.`,
    
    "Workers in natural resources and agriculture": `Natural resources and agriculture workers perform extraction, harvesting, and production tasks in the ${sector} sector. They operate equipment, follow production protocols, and support resource operations.`,
    
    "Harvesting and landscaping supervisors and laborers": `Harvesting and landscaping personnel maintain grounds, plant and harvest crops, and support outdoor environments in the ${sector} sector. They implement landscaping designs, manage plants, and maintain outdoor spaces.`,
    
    "Processing, manufacturing and utilities supervisors and central control operators": `Processing, manufacturing, and utilities supervisors and operators oversee production processes in the ${sector} sector. They monitor equipment, ensure quality standards, and maintain safe operations.`,
    
    "Processing and manufacturing machine operators and assemblers": `Processing and manufacturing operators run machinery and assemble products in the ${sector} sector. They follow production procedures, monitor quality, and maintain efficient operations.`,
    
    "Laborers in processing, manufacturing and utilities": `Processing, manufacturing, and utilities laborers perform manual tasks in production and utility operations in the ${sector} sector. They handle materials, assist with assembly, and support production activities.`
  };
  
  return descriptions[category] || `${category} professionals work in the ${sector} sector. They provide specialized services and require specific skills for their roles. This field offers various opportunities for career development and growth.`;
}

module.exports = {
  fetchJobPostings,
  saveJobs,
  getCategoryFromNOC,
  getSectorFromNAICS,
  getSkillsForCategory,
  getSalaryRangeForCategory,
  getMedianSalaryForCategory,
  getDescriptionForCategory,
  NOC_CATEGORIES,
  NAICS_SECTORS
};