/**
 * Test file for agent-daemon client
 */

import AgentClient from './index.js';

async function main() {
  const client = new AgentClient({
    host: '127.0.0.1',
    port: 4823
  });

  try {
    // Check health
    console.log('Checking daemon health...');
    const health = await client.health();
    console.log('Health:', health);

    // Run a simple task
    console.log('\nRunning search task...');
    const { response, ws } = await client.runWithEvents(
      'Search for "TypeScript documentation" and show me the top results',
      { headless: false, fast: true },
      {
        onProgress: (data) => {
          console.log('Progress:', data);
        },
        onScreenshot: (data) => {
          console.log('Screenshot saved:', data);
        },
        onDone: (data) => {
          console.log('Task completed:', data);
          ws.close();
        },
        onError: (data) => {
          console.error('Error:', data);
          ws.close();
        }
      }
    );

    console.log('Task started with ID:', response.id);

    // Keep the process alive for WebSocket events
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    client.closeAll();
  }
}

// Run the test
main().catch(console.error);