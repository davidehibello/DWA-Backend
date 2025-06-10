// // generateHash.js
// const bcrypt = require('bcryptjs');

// async function generateHash() {
//     const password = 'adpassminword';
//     const hash = await bcrypt.hash(password, 10);
//     console.log('Password:', password);
//     console.log('Generated hash:', hash);
    
//     // Verify the hash works
//     const verify = await bcrypt.compare(password, hash);
//     console.log('Verification test:', verify);
// }

// generateHash().catch(console.error);