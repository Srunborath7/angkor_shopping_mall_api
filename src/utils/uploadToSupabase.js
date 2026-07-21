const supabase = require('../config/supabase');

async function uploadFile(file, folder = "brands") {

    const fileName = `${Date.now()}-${file.originalname}`;

    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase
        .storage
        .from('uploads') // bucket name
        .upload(filePath, file.buffer, {
            contentType: file.mimetype
        });

    if (error) {
        throw new Error(error.message);
    }

    // public URL
    const { data: publicUrl } = supabase
        .storage
        .from('uploads')
        .getPublicUrl(filePath);

    return {
        path: filePath,
        url: publicUrl.publicUrl
    };
}
async function deleteFile(filePath) {

    const { error } = await supabase
        .storage
        .from('uploads')
        .remove([filePath]);
    if (error) {
        throw new Error(error.message);
    }
}
module.exports = {
    uploadFile,
    deleteFile
};