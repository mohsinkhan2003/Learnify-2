"""Deploy Learnify to a Hugging Face Docker Space (free, no card).

Run by .github/workflows/deploy-huggingface.yml. Creates the Space if needed, syncs its
secrets/variables from the environment, and uploads the tracked source files. Hugging Face
then builds the repository's Dockerfile.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

SECRETS = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "SESSION_SECRET",
]
VARIABLES = {
    "NODE_ENV": "production",
    "AI_PROVIDER": "openai",
    "RUN_MIGRATIONS": "true",
    "TRUST_PROXY": "1",
    "DATABASE_POOL_MAX": "5",
    "FRAME_ANCESTORS": "https://huggingface.co",
}
EXCLUDE_PREFIXES = (".github/", "e2e/", "tests/", "docs/", "deploy/")
SPACE_README = """---
title: Learnify
emoji: 📚
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 5000
pinned: false
short_description: AI homework tutor for schools
---

Learnify — an AI homework tutor. Open the app directly at its `.hf.space` address.
"""


def fail(message: str) -> None:
    print(f"::error::{message}")
    sys.exit(1)


def main() -> None:
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        print("::notice::HF_TOKEN is not set — skipping the Hugging Face deploy. See docs/DEPLOYMENT.md.")
        return
    for required in ("DATABASE_URL", "OPENAI_API_KEY"):
        if not os.environ.get(required, "").strip():
            fail(f"GitHub secret {required} is missing. Add it under Settings → Secrets and variables → Actions.")

    api = HfApi(token=token)
    owner = api.whoami()["name"]
    space = os.environ.get("HF_SPACE", "").strip() or "learnify"
    repo_id = space if "/" in space else f"{owner}/{space}"

    api.create_repo(repo_id, repo_type="space", space_sdk="docker", private=False, exist_ok=True)
    for key in SECRETS:
        value = os.environ.get(key, "").strip()
        if value:
            api.add_space_secret(repo_id, key, value)
    for key, value in VARIABLES.items():
        api.add_space_variable(repo_id, key, value)

    root = Path(__file__).resolve().parents[2]
    files = subprocess.run(["git", "ls-files"], cwd=root, check=True, capture_output=True, text=True).stdout.splitlines()
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp)
        for name in files:
            if name.startswith(EXCLUDE_PREFIXES) or name.lower().endswith(".zip") or name == "README.md":
                continue
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / name, target)
        (staging / "README.md").write_text(SPACE_README, encoding="utf-8")
        sha = os.environ.get("GITHUB_SHA", "local")[:7]
        api.upload_folder(
            repo_id=repo_id,
            repo_type="space",
            folder_path=staging,
            commit_message=f"Deploy {sha}",
            delete_patterns=["*"],  # remove files that no longer exist in the source
        )

    host = repo_id.replace("/", "-").replace("_", "-").replace(".", "-").lower()
    print(f"::notice::Deployed. Build progress: https://huggingface.co/spaces/{repo_id} — app: https://{host}.hf.space")


if __name__ == "__main__":
    main()
