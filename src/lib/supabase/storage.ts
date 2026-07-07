import { createClient } from './client';

/**
 * Uploads an image file to the 'item-attachments' storage bucket.
 * Organizes files by userId inside the bucket.
 * 
 * @param file The image File object to upload
 * @param userId The ID of the authenticated user
 * @returns The public URL of the uploaded image
 */
export async function uploadItemImage(file: File, userId: string): Promise<string> {
  const supabase = createClient();
  const fileExt = file.name.split('.').pop();
  const uniqueId = Math.random().toString(36).substring(2, 10);
  const filePath = `${userId}/${uniqueId}-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('item-attachments')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Error uploading file to storage:', uploadError);
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from('item-attachments').getPublicUrl(filePath);
  
  if (!data || !data.publicUrl) {
    throw new Error('Failed to retrieve uploaded image public URL.');
  }

  return data.publicUrl;
}
