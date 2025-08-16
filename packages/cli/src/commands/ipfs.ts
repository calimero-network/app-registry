import { Command } from 'commander';
import { uploadToIPFS, downloadFromIPFS } from '../lib/ipfs';
import { spinner } from '../utils/spinner';

export const ipfsCommand = new Command('ipfs')
  .description('IPFS operations')
  .addCommand(
    new Command('upload')
      .description('Upload a file to IPFS')
      .argument('<file>', 'Path to the file to upload')
      .option(
        '-g, --gateway <url>',
        'IPFS gateway URL',
        'https://ipfs.infura.io:5001/api/v0'
      )
      .action(async (file, options) => {
        const s = spinner('Uploading to IPFS...').start();

        try {
          const cid = await uploadToIPFS(file, options.gateway);
          s.succeed(`File uploaded successfully!`);
          console.log(`CID: ${cid}`);
          console.log(`Gateway URL: https://ipfs.io/ipfs/${cid}`);
        } catch (error) {
          s.fail('Upload failed');
          console.error(
            'Error:',
            error instanceof Error ? error.message : 'Unknown error'
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('download')
      .description('Download a file from IPFS')
      .argument('<cid>', 'IPFS CID to download')
      .argument('[output]', 'Output file path (optional)')
      .option(
        '-g, --gateway <url>',
        'IPFS gateway URL',
        'https://ipfs.infura.io:5001/api/v0'
      )
      .action(async (cid, output, options) => {
        const s = spinner('Downloading from IPFS...').start();

        try {
          const outputPath = await downloadFromIPFS(
            cid,
            output,
            options.gateway
          );
          s.succeed(`File downloaded successfully!`);
          console.log(`Saved to: ${outputPath}`);
          console.log(`Gateway URL: https://ipfs.io/ipfs/${cid}`);
        } catch (error) {
          s.fail('Download failed');
          console.error(
            'Error:',
            error instanceof Error ? error.message : 'Unknown error'
          );
          process.exit(1);
        }
      })
  );
