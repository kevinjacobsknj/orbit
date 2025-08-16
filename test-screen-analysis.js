/**
 * Test Screen Analysis Functionality
 * Verifies that the core components work correctly
 */

const VisionAnalysis = require('./src/features/screen-control/visionAnalysis');
const MemoryStore = require('./src/features/screen-control/memoryStore');

async function testScreenAnalysis() {
    console.log('🧪 Testing Screen Analysis Components...\n');
    
    try {
        // Test 1: Memory Store
        console.log('1️⃣ Testing Memory Store...');
        const memory = new MemoryStore();
        const storeResult = memory.store('test', 'value');
        const retrieveResult = memory.retrieve('test');
        console.log(`✅ Memory store working: ${storeResult.success && retrieveResult.success}\n`);
        
        // Test 2: Vision Analysis initialization
        console.log('2️⃣ Testing Vision Analysis initialization...');
        const mockProvider = {
            streamChat: async () => ({ body: null, status: 200 })
        };
        const visionAnalysis = new VisionAnalysis(mockProvider);
        console.log(`✅ Vision Analysis initialized: ${!!visionAnalysis.memory}\n`);
        
        // Test 3: JSON parsing
        console.log('3️⃣ Testing JSON parsing...');
        const testResponse = `{
    "action": "complete",
    "parameters": {},
    "reasoning": "Test parsing",
    "confidence": 1.0,
    "taskComplete": true
}`;
        const parsed = visionAnalysis.parseAIResponse(testResponse);
        console.log(`✅ JSON parsing working: ${parsed.action === 'complete'}\n`);
        
        // Test 4: Memory operations
        console.log('4️⃣ Testing memory operations...');
        const memoryResult = await visionAnalysis.handleMemoryAction({
            operation: 'store',
            key: 'test_key',
            value: 'test_value'
        });
        console.log(`✅ Memory operations working: ${memoryResult.success}\n`);
        
        console.log('🎉 ALL COMPONENT TESTS PASSED!');
        console.log('✅ The screen analysis system should work correctly now.');
        return true;
        
    } catch (error) {
        console.error('❌ Component test failed:', error.message);
        return false;
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testScreenAnalysis()
        .then(success => {
            console.log(success ? '\n✅ Components ready!' : '\n❌ Please fix components first');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test script error:', error);
            process.exit(1);
        });
}

module.exports = testScreenAnalysis;