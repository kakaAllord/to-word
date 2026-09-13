/** @type {import('next').NextConfig} */
const nextConfig = {
  // The worker and several server routes use node APIs (fs, child_process, pg).
  serverExternalPackages: ['pg', 'bcryptjs', 'docx'],
  experimental: {
    // Uploads are streamed straight to the volume; allow large bodies through
    // server actions too (the upload route itself streams and is unbounded).
    serverActions: { bodySizeLimit: '250mb' },
  },
};
export default nextConfig;
