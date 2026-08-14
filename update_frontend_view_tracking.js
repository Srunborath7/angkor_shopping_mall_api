const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..', 'angkor_shopping_mall');
console.log('Frontend directory:', frontendDir);

// 1. Update src/api/api.js
const apiJsPath = path.join(frontendDir, 'src', 'api', 'api.js');
if (fs.existsSync(apiJsPath)) {
    let apiContent = fs.readFileSync(apiJsPath, 'utf8');
    
    // Ensure token extraction checks store, persist:root, and direct localStorage keys
    const oldInterceptor = `apiClient.interceptors.request.use(
    (axiosConfig) => {
        const token = store.getState()?.auth?.token;
        if (token) {
            axiosConfig.headers.Authorization = \`Bearer \${token}\`;
        }`;

    const newInterceptor = `apiClient.interceptors.request.use(
    (axiosConfig) => {
        let token = store.getState()?.auth?.token;
        if (!token) {
            try {
                const rootPersist = localStorage.getItem("persist:root");
                if (rootPersist) {
                    const parsed = JSON.parse(rootPersist);
                    if (parsed.auth) {
                        const authObj = JSON.parse(parsed.auth);
                        token = authObj.token;
                    }
                }
                if (!token) {
                    token = localStorage.getItem("token") || localStorage.getItem("accessToken");
                }
            } catch (e) {}
        }
        if (token) {
            axiosConfig.headers.Authorization = \`Bearer \${token}\`;
        }`;

    if (apiContent.includes(oldInterceptor)) {
        apiContent = apiContent.replace(oldInterceptor, newInterceptor);
        fs.writeFileSync(apiJsPath, apiContent, 'utf8');
        console.log('✓ Successfully updated src/api/api.js with robust token injection');
    } else {
        console.log('Note: api.js already updated or has different structure');
    }
}

// 2. Update src/pages/website/ProductDetailPage.jsx
const productDetailPath = path.join(frontendDir, 'src', 'pages', 'website', 'ProductDetailPage.jsx');
if (fs.existsSync(productDetailPath)) {
    let detailContent = fs.readFileSync(productDetailPath, 'utf8');

    // Ensure trackInteractionApi(id, "view") is triggered immediately on load
    const targetCode = `      try {
        const res = await getProductByIdApi(id);`;

    const replacementCode = `      // Record 'view' interaction for recommendations
      trackInteractionApi(id, "view").catch(() => {});

      try {
        const res = await getProductByIdApi(id);`;

    if (!detailContent.includes('// Record \'view\' interaction for recommendations') && detailContent.includes(targetCode)) {
        detailContent = detailContent.replace(targetCode, replacementCode);
        fs.writeFileSync(productDetailPath, detailContent, 'utf8');
        console.log('✓ Successfully updated ProductDetailPage.jsx to record view interaction');
    } else {
        console.log('Note: ProductDetailPage.jsx already contains direct view tracking');
    }
}

console.log('Frontend updates complete.');
