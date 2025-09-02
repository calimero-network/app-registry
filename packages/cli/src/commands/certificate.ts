import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import {
  loadCertificate,
  saveCertificate,
  removeCertificate,
  createClientWithCertificate,
  validateCertificateWithServer,
  getCertificatePath,
  type Certificate,

  ensureValidCertificate,
} from '../lib/certificate.js';

export const certificateCommand = new Command('certificate')
  .description('Manage developer certificates');

certificateCommand
  .command('status')
  .description('Show certificate status')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts();
    try {
      const cert = loadCertificate();
      
      if (cert) {
        console.log('🔐 Certificate Status:');
        console.log(`  ID: ${cert.certificate_id}`);
        console.log(`  Developer: ${cert.developer_pubkey}`);
        console.log(`  Status: ${cert.status}`);
        console.log(`  Issued: ${cert.issued_at}`);
        console.log(`  Expires: ${cert.expires_at}`);
        console.log(`  Issuer: ${cert.issuer}`);
        
        // Check if it's still valid
        const now = new Date();
        const expiresAt = new Date(cert.expires_at);
        if (expiresAt > now) {
          console.log('✅ Certificate is valid and not expired');
        } else {
          console.log('❌ Certificate has expired');
        }
      } else {
        console.log('❌ No certificate installed');
        console.log('💡 Run any app command to automatically generate one');
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

certificateCommand
  .command('auto-generate')
  .description('Automatically generate a new certificate')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts();
    try {
      console.log('🔐 Automatically generating new certificate...');
      const cert = await ensureValidCertificate(globalOpts?.url || 'http://localhost:8082');
      console.log('✅ Certificate generated:', cert.certificate_id);
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

certificateCommand
  .addCommand(
    new Command('install')
      .description('Install a certificate from file')
      .argument('<file>', 'Certificate file path')
      .action(async (filePath) => {
        const spinner = ora('Installing certificate...').start();

        try {
          // Check if file exists
          if (!fs.existsSync(filePath)) {
            spinner.fail('Certificate file not found');
            console.error(chalk.red(`Error: File '${filePath}' does not exist`));
            process.exit(1);
          }

          // Read and parse certificate
          const certData = fs.readFileSync(filePath, 'utf8');
          const certificate: Certificate = JSON.parse(certData);

          // Basic validation
          if (!certificate.developer_pubkey || !certificate.certificate_id) {
            spinner.fail('Invalid certificate format');
            console.error(chalk.red('Error: Invalid certificate format'));
            process.exit(1);
          }

          // Save certificate
          saveCertificate(certificate);

          // Validate with server
          const client = createClientWithCertificate();
          const isValid = await validateCertificateWithServer(
            client,
            certificate.developer_pubkey
          );

          if (isValid) {
            spinner.succeed('Certificate installed and validated successfully');
            console.log(chalk.green(`Developer: ${certificate.developer_pubkey.substring(0, 12)}...`));
            console.log(chalk.green(`Certificate ID: ${certificate.certificate_id}`));
            console.log(chalk.green(`Expires: ${new Date(certificate.expires_at).toLocaleDateString()}`));
          } else {
            spinner.warn('Certificate installed but not validated with server');
            console.log(chalk.yellow('Warning: Certificate may not be recognized by the server'));
          }
        } catch (error) {
          spinner.fail('Failed to install certificate');
          if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('clear')
      .description('Remove installed certificate')
      .action(() => {
        const certStatus = loadCertificate();

        if (!certStatus.hasCertificate) {
          console.log(chalk.yellow('No certificate to remove'));
          return;
        }

        removeCertificate();
        console.log(chalk.green('Certificate removed successfully'));
      })
  )
  .addCommand(
    new Command('path')
      .description('Show certificate file path')
      .action(() => {
        console.log(getCertificatePath());
      })
  );
