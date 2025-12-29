#!/usr/bin/env node

const { createClient } = require('redis');

const redisUrl =
  'redis://default:6NJB22CPkmhy0AsULTF6Lro8rwHHfvlq@redis-14502.c300.eu-central-1-1.ec2.redns.redis-cloud.com:14502';

async function checkRedis() {
  const client = createClient({ url: redisUrl });

  client.on('error', err => {
    console.error('Redis error:', err);
    process.exit(1);
  });

  await client.connect();
  console.log('✅ Connected to Redis\n');

  // Check all keys
  const allKeys = await client.keys('*');
  console.log(`📦 Total keys: ${allKeys.length}\n`);

  // Check bundle keys
  const bundleKeys = await client.keys('bundle:*');
  console.log(`📋 Bundle manifests: ${bundleKeys.length}`);
  bundleKeys.forEach(key => console.log(`  - ${key}`));
  console.log();

  // Check binary keys
  const binaryKeys = await client.keys('binary:*');
  console.log(`💾 Binary artifacts: ${binaryKeys.length}`);
  binaryKeys.forEach(key => console.log(`  - ${key}`));
  console.log();

  // Check specific bundle
  const bundleKey = 'bundle:com.calimero.kvstore/0.2.5';
  const bundleData = await client.get(bundleKey);
  if (bundleData) {
    const parsed = JSON.parse(bundleData);
    console.log(`✅ Bundle manifest found: ${bundleKey}`);
    console.log(`   Package: ${parsed.json.package}`);
    console.log(`   Version: ${parsed.json.appVersion}`);
    console.log(`   Created: ${parsed.created_at}`);
  } else {
    console.log(`❌ Bundle manifest NOT found: ${bundleKey}`);
  }
  console.log();

  // Check binary
  const binaryKey = 'binary:com.calimero.kvstore/0.2.5';
  const binaryExists = await client.exists(binaryKey);
  if (binaryExists) {
    const binaryLength = await client.strLen(binaryKey);
    console.log(`✅ Binary found: ${binaryKey}`);
    console.log(`   Length: ${binaryLength} characters (hex)`);
    console.log(`   Size: ~${Math.floor(binaryLength / 2)} bytes`);
  } else {
    console.log(`❌ Binary NOT found: ${binaryKey}`);
  }
  console.log();

  // Check bundles list
  const allBundles = await client.sMembers('bundles:all');
  console.log(`📦 All packages: ${allBundles.length}`);
  allBundles.forEach(pkg => console.log(`  - ${pkg}`));
  console.log();

  // Check versions for kvstore
  const versions = await client.sMembers(
    'bundle-versions:com.calimero.kvstore'
  );
  console.log(`🏷️  Versions for com.calimero.kvstore: ${versions.length}`);
  versions.forEach(v => console.log(`  - ${v}`));

  await client.quit();
}

checkRedis().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
