const os = require('os');
const { spawn } = require('child_process');

// Function to calculate the available memory
function calculateAvailableMemory() {
  const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024); // Total memory in GB
  const freeMemoryGB = os.freemem() / (1024 * 1024 * 1024); // Free memory in GB
  const availableMemoryGB = Math.min(freeMemoryGB, totalMemoryGB * 0.1, 4); // 10% of total memory or 4GB, whichever is smaller
  return availableMemoryGB;
}

async function main() {
  // Calculate available memory
  const availableMemoryGB = calculateAvailableMemory();
  const memoryLimit = Math.floor(availableMemoryGB * 1024); // Convert to MB
  console.log(`Memory Limit: ${memoryLimit} MB`);

  // Launch Node.js process with the calculated memory limit
  const args = ['do.js']; // Pass the name of the script file to execute
  const nodePath = process.argv[0]; // Path to Node.js executable
  const options = { stdio: 'inherit', detached: true };
  spawn(nodePath, args, { ...options, env: { ...process.env, MEMORY_LIMIT: memoryLimit } });
  process.exit(); // Terminate current process
}

main().catch(console.error);
