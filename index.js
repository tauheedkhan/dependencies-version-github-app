const axios = require('axios');
const { createAppAuth } = require('@octokit/auth-app');
const express = require('express');
const fs = require('fs');

const pem = fs.readFileSync('./key.pem', 'utf8');

run().catch(err => console.log(err));

async function run() {
  const app = express();
  app.use(express.json());

  app.post('/github', function(req, res) {
    console.log('Github post', req.body);

    if (req.body != null && req.body.ref === 'refs/heads/master') {
      const installationId = req.body.installation.id;
      const sha = req.body.after;
      checkPackageJSON(req.body.repository.full_name, installationId, sha);
    }
  });

  app.listen(80);
}

async function createJWT(installationId) {
  const auth = createAppAuth({
    id: '57445',
    privateKey: pem,
    installationId,
   // clientId: app client id,
   // clientSecret: app client secret'
  });

  const { token } = await auth({ type: 'installation' });
  return token;
}

async function githubRequest(url, installationId) {
  const token = await createJWT(installationId);

  const res = await axios.get(`https://api.github.com${url}`, {
    headers: {
      authorization: `bearer ${token}`,
      accept: 'application/vnd.github.machine-man-preview+json'
    }
  });

  return res.data;
}

function isStrictDependencies(deps) {
    return !Object.keys(deps).find(key => {
      return !/^\d+\.\d+\.\d+$/.test(deps[key]);
    });
  }

  async function checkPackageJSON(repo, installationId, sha) {
    let pkg = await githubRequest(`/repos/${repo}/contents/package.json`, installationId).
      then(res => res.content).
      then(content => Buffer.from(content, 'base64').toString('utf8'));
  
    try {
      pkg = JSON.parse(pkg);
    } catch (err) { return; }
  
    const ok = isStrictDependencies(pkg.dependencies);
    await githubRequest(`/repos/${repo}/check-runs`, installationId, 'POST', {
      name: 'strict-dependencies',
      head_sha: sha,
      status: 'completed',
      conclusion: ok ? 'success' : 'failure',
      output: {
        title: ok ? 'No semver ranges found' : 'Semver ranges found!',
        summary: ok ? 'Good job!' : 'Found a semver range in `dependencies`'
      }
    });
  }
  
  async function githubRequest(url, installationId, method, data) {
    const token = await createJWT(installationId);
    if (method == null) {
      method = 'get';
    } else {
      method = method.toLowerCase();
    }
  
    const accept = url.includes('/check-runs') ?
      'application/vnd.github.antiope-preview+json' :
      'application/vnd.github.machine-man-preview+json';
  
    const res = await axios({
      method,
      url: `https://api.github.com${url}`,
      data,
      headers: {
        authorization: `bearer ${token}`,
        accept
      }
    });
  
    return res.data;
  }