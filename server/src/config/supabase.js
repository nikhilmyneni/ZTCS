const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = process.env.SUPABASE_BUCKET || 'ztcs-files';

/**
 * Upload a file buffer to Supabase Storage
 */
const uploadToSupabase = async (fileBuffer, filePath, mimeType) => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw error;

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return {
    path: data.path,
    publicUrl: urlData.publicUrl,
  };
};

/**
 * Delete a file from Supabase Storage
 */
const deleteFromSupabase = async (filePath) => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([filePath]);

  if (error) throw error;
};

/**
 * Generate a signed (time-limited) download URL
 */
const getSignedUrl = async (filePath, expiresIn = 3600) => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw error;
  return data.signedUrl;
};

module.exports = { supabase, uploadToSupabase, deleteFromSupabase, getSignedUrl };
