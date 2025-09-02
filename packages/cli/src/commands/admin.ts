import { Command } from 'commander';
import { createCertificateTemplate, signCertificate, generateKeyPair } from '../lib/certificate-signer.js';
import * as fs from 'fs';
import * as path from 'path';

export const adminCommand = new Command('admin')
  .description('Administrative operations');

adminCommand
  .command('generate-keypair')
  .description('Generate a new key pair for signing certificates')
  .option('-o, --output <path>', 'Output directory for key files', './keys')
  .action(async (options) => {
    try {
      const outputDir = path.resolve(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log('🔑 Generating new key pair...');
      const keypair = generateKeyPair();
      
      const publicKeyPath = path.join(outputDir, 'registry-public.key');
      const privateKeyPath = path.join(outputDir, 'registry-private.key');
      
      fs.writeFileSync(publicKeyPath, keypair.publicKey);
      fs.writeFileSync(privateKeyPath, keypair.privateKey);
      
      console.log('✅ Key pair generated successfully!');
      console.log(`📁 Public key: ${publicKeyPath}`);
      console.log(`🔒 Private key: ${privateKeyPath}`);
      console.log(`🔑 Public key: ${keypair.publicKey}`);
    } catch (error) {
      console.error('❌ Error generating key pair:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

adminCommand
  .command('create-certificate')
  .description('Create a certificate for a whitelisted developer')
  .requiredOption('-p, --pubkey <pubkey>', 'Developer public key (ed25519:...)')
  .option('-i, --issuer <name>', 'Issuer name', 'registry-admin')
  .option('-d, --duration <days>', 'Certificate duration in days', '365')
  .option('-o, --output <path>', 'Output file path', './certificates')
  .action(async (options) => {
    try {
      const outputPath = path.resolve(options.output);
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      console.log('🔐 Creating certificate for developer...');
      console.log(`📱 Public key: ${options.pubkey}`);
      
      // First check if we have keys, otherwise generate them
      const keysPath = path.resolve('./registry-keys.json');
      let keys;
      
      if (fs.existsSync(keysPath)) {
        keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        console.log('📋 Using existing registry keys');
      } else {
        console.log('🔑 Generating new registry keys...');
        const { generateKeyPair } = await import('../lib/certificate-signer.js');
        keys = generateKeyPair();
        fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
        console.log(`💾 Saved registry keys to: ${keysPath}`);
      }

      // Generate certificate template
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(options.duration));
      
      const cert = createCertificateTemplate(
        options.pubkey,
        `cert-${Date.now()}`,
        keys.publicKey,
        expiresAt.toISOString()
      );
      
      // Sign the certificate with real keys
      const signedCert = await signCertificate(cert, keys.privateKey);
      
      // Save to file
      const filename = `cert-${Date.now()}.json`;
      const filepath = path.join(outputPath, filename);
      fs.writeFileSync(filepath, JSON.stringify(signedCert, null, 2));
      
      console.log('✅ Certificate created successfully!');
      console.log(`📁 File: ${filepath}`);
      console.log(`🆔 Certificate ID: ${signedCert.certificate_id}`);
      console.log(`📅 Expires: ${signedCert.expires_at}`);
      
      // Instructions for developer
      console.log('\n📋 Instructions for developer:');
      console.log(`1. Copy this file to the developer: ${filepath}`);
      console.log(`2. Developer runs: ssapp-registry certificate install ${filename}`);
      console.log(`3. Certificate will be automatically used for all operations`);
      
    } catch (error) {
      console.error('❌ Error creating certificate:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

adminCommand
  .command('generate-for-whitelisted')
  .description('Automatically generate certificates for all whitelisted developers')
  .option('-o, --output <path>', 'Output directory for certificates', './certificates')
  .option('-i, --issuer <name>', 'Issuer name', 'registry-admin')
  .option('-d, --duration <days>', 'Certificate duration in days', '365')
  .action(async (options) => {
    try {
      const outputPath = path.resolve(options.output);
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      console.log('🔐 Generating certificates for all whitelisted developers...');
      
      // In a real implementation, this would fetch from the backend
      // For now, we'll use the known whitelisted developer
      const whitelistedDevelopers = [
        'ed25519:HmfQPNZqEbM8vBUe6hmWJ87KYZJRQEtSFf2BvSfwVszq'
      ];
      
      for (const pubkey of whitelistedDevelopers) {
        console.log(`\n📱 Processing: ${pubkey}`);
        
        try {
          // Generate certificate template
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + parseInt(options.duration));
          
          // First check if we have keys, otherwise generate them
          const keysPath = path.resolve('./registry-keys.json');
          let keys;
          
          if (fs.existsSync(keysPath)) {
            keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
            console.log('📋 Using existing registry keys');
          } else {
            console.log('🔑 Generating new registry keys...');
            const { generateKeyPair } = await import('../lib/certificate-signer.js');
            keys = generateKeyPair();
            fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
            console.log(`💾 Saved registry keys to: ${keysPath}`);
          }

          const cert = createCertificateTemplate(
            pubkey,
            `cert-${Date.now()}`,
            keys.publicKey,
            expiresAt.toISOString()
          );
          
          // Sign the certificate with real keys
          const signedCert = await signCertificate(cert, keys.privateKey);
          
          // Save to file
          const filename = `cert-${signedCert.certificate_id}.json`;
          const filepath = path.join(outputPath, filename);
          fs.writeFileSync(filepath, JSON.stringify(signedCert, null, 2));
          
          console.log(`✅ Generated: ${filename}`);
          console.log(`   ID: ${signedCert.certificate_id}`);
          console.log(`   Expires: ${signedCert.expires_at}`);
          
        } catch (error) {
          console.error(`❌ Failed to generate for ${pubkey}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      console.log(`\n🎉 Generated ${whitelistedDevelopers.length} certificate(s) in: ${outputPath}`);
      console.log('\n📋 Next steps:');
      console.log('1. Review generated certificates');
      console.log('2. Send certificates to respective developers');
      console.log('3. Developers install with: ssapp-registry certificate install <file>');
      
    } catch (error) {
      console.error('❌ Error generating certificates:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Add invite management commands
adminCommand
  .command('create-invite')
  .description('Create an invite link for a new developer')
  .requiredOption('-e, --email <email>', 'Developer email address')
  .requiredOption('-n, --name <name>', 'Developer full name')
  .option('-g, --github <username>', 'GitHub username')
  .option('-c, --company <company>', 'Company name')
  .option('-r, --role <role>', 'Developer role')
  .option('-d, --days <days>', 'Invite expiration in days', '7')
  .option('-u, --url <url>', 'Registry URL', 'http://localhost:8082')
  .action(async (options) => {
    try {
      console.log('📧 Creating invite for developer...');
      console.log(`   Email: ${options.email}`);
      console.log(`   Name: ${options.name}`);
      if (options.company) console.log(`   Company: ${options.company}`);
      if (options.github) console.log(`   GitHub: ${options.github}`);
      console.log(`   Expires: ${options.days} days`);
      
      const inviteData = {
        email: options.email,
        name: options.name,
        github: options.github,
        company: options.company,
        role: options.role,
        expiresInDays: parseInt(options.days)
      };
      
      // Create invite via API
      const response = await fetch(`${options.url}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inviteData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create invite');
      }
      
      const result = await response.json();
      
      console.log('\n✅ Invite created successfully!');
      console.log(`🔗 Invite Link: ${result.invite_link}`);
      console.log(`⏰ Expires: ${new Date(result.expires_at).toLocaleString()}`);
      
      console.log('\n📋 Next Steps:');
      console.log(`1. Send this link to ${options.name}:`);
      console.log(`   ${result.invite_link}`);
      console.log('2. Developer clicks link to get certificate');
      console.log('3. Developer installs certificate and starts publishing');
      
      console.log('\n💡 Email Template:');
      console.log('─'.repeat(50));
      console.log(`Subject: Welcome to SSApp Registry - Invitation`);
      console.log('');
      console.log(`Hi ${options.name},`);
      console.log('');
      console.log('You have been invited to join the SSApp Registry!');
      console.log('');
      console.log('Click this link to get your developer certificate:');
      console.log(result.invite_link);
      console.log('');
      console.log('This link expires in 7 days.');
      console.log('');
      console.log('Happy building!');
      console.log('The SSApp Registry Team');
      console.log('─'.repeat(50));
      
    } catch (error) {
      console.error('❌ Error creating invite:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

adminCommand
  .command('list-invites')
  .description('List all pending invites')
  .option('-u, --url <url>', 'Registry URL', 'http://localhost:8082')
  .action(async (options) => {
    try {
      console.log('📋 Fetching pending invites...');
      
      const response = await fetch(`${options.url}/invites`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch invites');
      }
      
      const invites = await response.json();
      
      if (invites.length === 0) {
        console.log('📭 No pending invites found.');
        return;
      }
      
      console.log(`\n📧 Found ${invites.length} pending invite(s):\n`);
      
      invites.forEach((invite, index) => {
        console.log(`${index + 1}. ${invite.name} (${invite.email})`);
        console.log(`   Token: ${invite.token}`);
        console.log(`   Created: ${new Date(invite.created_at).toLocaleString()}`);
        console.log(`   Expires: ${new Date(invite.expires_at).toLocaleString()}`);
        console.log(`   Status: ${invite.status}`);
        console.log('');
      });
      
    } catch (error) {
      console.error('❌ Error listing invites:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });
