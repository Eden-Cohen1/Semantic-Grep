const path = require('path');
const { TreeSitterChunker } = require('./out/indexing/chunkers/TreeSitterChunker');

async function testVueChunking() {
  console.log('=== Testing Vue Options API Chunking ===\n');

  const chunker = new TreeSitterChunker();
  const testFiles = [
    'src/test/fixtures/vue/OptionsApi.vue',
    'src/test/fixtures/vue/ComplexOptionsApi.vue'
  ];

  for (const file of testFiles) {
    const filePath = path.join(__dirname, file);
    console.log(`\n📄 Testing file: ${file}`);
    console.log('='.repeat(80));

    try {
      const result = await chunker.chunkFile(filePath);

      console.log(`✅ Parse success: ${result.parseSuccess}`);
      console.log(`📊 Total chunks: ${result.chunks.length}`);
      console.log(`🔧 Parse method: ${result.parseMethod}\n`);

      // Group chunks by type
      const chunksByType = {};
      result.chunks.forEach(chunk => {
        if (!chunksByType[chunk.type]) {
          chunksByType[chunk.type] = [];
        }
        chunksByType[chunk.type].push(chunk);
      });

      // Display chunks by type
      console.log('Chunks by type:');
      Object.keys(chunksByType).sort().forEach(type => {
        console.log(`\n  ${type.toUpperCase()} (${chunksByType[type].length} chunks):`);
        chunksByType[type].forEach(chunk => {
          const preview = chunk.text.split('\n')[0].trim().substring(0, 60);
          console.log(`    - Line ${chunk.startLine}-${chunk.endLine}: ${preview}...`);
        });
      });

      console.log('\n' + '='.repeat(80));

    } catch (error) {
      console.error(`❌ Error chunking ${file}:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  console.log('\n✨ Vue Options API chunking test complete!\n');
}

testVueChunking().catch(console.error);
