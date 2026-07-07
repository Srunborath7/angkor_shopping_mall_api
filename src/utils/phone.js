function normalizePhone(phone) {
    if (!phone) return null;

    // remove spaces, +, -, brackets
    phone = phone.replace(/\D/g, "");

    // Cambodia format
    // 855974242291 -> 0974242291
    if (phone.startsWith("855")) {
        phone = "0" + phone.substring(3);
    }

    // already 0974242291
    return phone;
}

module.exports = normalizePhone;