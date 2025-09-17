import { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import {
  loadCertificate,
  saveCertificate,
  removeCertificate,
} from '@/lib/certificate';
import type { Certificate } from '@/lib/certificate';

export default function CertificateManager() {
  const [certStatus, setCertStatus] = useState(loadCertificate());
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const text = await file.text();
      const certificate: Certificate = JSON.parse(text);

      // Basic validation
      if (!certificate.developer_pubkey || !certificate.certificate_id) {
        throw new Error('Invalid certificate format');
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(certificate.expires_at);

      if (expiresAt < now) {
        throw new Error('Certificate has expired');
      }

      // Save certificate
      saveCertificate(certificate);
      setCertStatus(loadCertificate());

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load certificate'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveCertificate = () => {
    removeCertificate();
    setCertStatus(loadCertificate());
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className='bg-white rounded-lg shadow p-6'>
      <h3 className='text-lg font-semibold text-gray-900 mb-4'>
        Developer Certificate
      </h3>

      {certStatus.hasCertificate ? (
        <div className='space-y-4'>
          <div className='flex items-center space-x-2'>
            <CheckCircle className='w-5 h-5 text-green-500' />
            <span className='text-green-700 font-medium'>
              Certificate Installed
            </span>
          </div>

          <div className='bg-gray-50 rounded p-4 space-y-2 text-sm'>
            <div className='flex justify-between'>
              <span className='text-gray-600'>Developer:</span>
              <span className='font-mono text-gray-900'>
                {certStatus.certificate!.developer_pubkey.substring(0, 12)}...
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-600'>Certificate ID:</span>
              <span className='font-mono text-gray-900'>
                {certStatus.certificate!.certificate_id}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-600'>Issuer:</span>
              <span className='text-gray-900'>
                {certStatus.certificate!.issuer}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-600'>Issued:</span>
              <span className='text-gray-900'>
                {formatDate(certStatus.certificate!.issued_at)}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-600'>Expires:</span>
              <span className='text-gray-900'>
                {formatDate(certStatus.certificate!.expires_at)}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-gray-600'>Status:</span>
              <span
                className={`font-medium ${
                  certStatus.certificate!.status === 'active'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {certStatus.certificate!.status}
              </span>
            </div>
          </div>

          <button
            onClick={handleRemoveCertificate}
            className='flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors'
          >
            <Trash2 className='w-4 h-4' />
            <span>Remove Certificate</span>
          </button>
        </div>
      ) : (
        <div className='space-y-4'>
          <div className='flex items-center space-x-2'>
            <XCircle className='w-5 h-5 text-red-500' />
            <span className='text-red-700 font-medium'>
              No Certificate Installed
            </span>
          </div>

          <p className='text-gray-600 text-sm'>
            You need a developer certificate to upload applications to the
            registry.
          </p>

          <div className='border-2 border-dashed border-gray-300 rounded-lg p-6 text-center'>
            <input
              ref={fileInputRef}
              type='file'
              accept='.json'
              onChange={handleFileUpload}
              className='hidden'
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className='flex items-center space-x-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            >
              {isUploading ? (
                <>
                  <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className='w-4 h-4' />
                  <span>Upload Certificate</span>
                </>
              )}
            </button>

            <p className='text-gray-500 text-xs mt-2'>
              Select a JSON certificate file
            </p>
          </div>

          {error && (
            <div className='flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
              <AlertCircle className='w-4 h-4 text-red-500' />
              <span className='text-red-700 text-sm'>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
