const BUCKET = 'student-photos';
const MAX_BYTES = 700 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;

// Checks the file signature instead of trusting the declared type.
function detectImageType(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length > 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function createStudentPhotoHandlers(supabaseAdmin) {
  let bucketReady = false;

  async function ensureBucket() {
    if (bucketReady) return;

    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    // An existing bucket is fine; anything else is a real failure.
    if (error && !/already exists|duplicate/i.test(error.message || '')) {
      throw error;
    }

    bucketReady = true;
  }

  async function findStudentId(profileId) {
    const { data, error } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) throw error;
    return data?.id || null;
  }

  return {
    // Short-lived link to the student's photo, or null if none is stored.
    async signedUrl(studentId) {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(studentId, SIGNED_URL_SECONDS);

        return error ? null : data?.signedUrl || null;
      } catch {
        return null;
      }
    },

    async upload(profileId, body) {
      try {
        const encoded = typeof body?.data === 'string' ? body.data : '';

        if (!encoded) {
          return { status: 400, body: { error: 'Choose an image to upload.' } };
        }

        const buffer = Buffer.from(encoded, 'base64');

        if (!buffer.length || buffer.length > MAX_BYTES) {
          return {
            status: 400,
            body: { error: 'The image must be smaller than 700 KB.' }
          };
        }

        const contentType = detectImageType(buffer);

        if (!contentType) {
          return {
            status: 400,
            body: { error: 'Upload a JPEG, PNG or WebP image.' }
          };
        }

        const studentId = await findStudentId(profileId);

        if (!studentId) {
          return {
            status: 404,
            body: { error: 'No student record is linked to this account.' }
          };
        }

        await ensureBucket();

        const { error } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(studentId, buffer, { contentType, upsert: true });

        if (error) throw error;

        return {
          status: 200,
          body: { photo_url: await this.signedUrl(studentId) }
        };
      } catch (error) {
        console.error('[photo] Upload failed:', error?.message || 'unknown error');
        return { status: 500, body: { error: 'Could not upload the photo.' } };
      }
    },

    async remove(profileId) {
      try {
        const studentId = await findStudentId(profileId);

        if (!studentId) {
          return {
            status: 404,
            body: { error: 'No student record is linked to this account.' }
          };
        }

        const { error } = await supabaseAdmin.storage
          .from(BUCKET)
          .remove([studentId]);

        if (error) throw error;

        return { status: 200, body: { photo_url: null } };
      } catch (error) {
        console.error('[photo] Remove failed:', error?.message || 'unknown error');
        return { status: 500, body: { error: 'Could not remove the photo.' } };
      }
    }
  };
}
