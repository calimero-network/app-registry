#!/bin/bash

# Script to detect which packages have changes since their last release
# Usage: ./scripts/detect-changes.sh [commit-range]

set -e

# Default to HEAD if no commit range provided
COMMIT_RANGE=${1:-"HEAD"}
COMMIT_MSG=$(git log -1 --pretty=format:"%s")

echo "🔍 Analyzing changes in range: $COMMIT_RANGE"
echo "📝 Commit message: $COMMIT_MSG"

# If a specific range is provided, use it directly
if [ "$COMMIT_RANGE" != "HEAD" ]; then
    # Parse the range to get start and end
    if [[ "$COMMIT_RANGE" == *".."* ]]; then
        START_COMMIT=$(echo "$COMMIT_RANGE" | cut -d'.' -f1)
        END_COMMIT=$(echo "$COMMIT_RANGE" | cut -d'.' -f3)
        echo "📦 Using provided range: $START_COMMIT..$END_COMMIT"
    else
        START_COMMIT="$COMMIT_RANGE"
        END_COMMIT="HEAD"
        echo "📦 Using single commit: $START_COMMIT"
    fi
else
    # Get the last tag for each package, or use initial commit if no tags exist
    CLI_LAST_TAG=$(git describe --tags --match "cli-v*" --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)
    LIB_LAST_TAG=$(git describe --tags --match "lib-v*" --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)
    BACKEND_LAST_TAG=$(git describe --tags --match "backend-v*" --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)
    FRONTEND_LAST_TAG=$(git describe --tags --match "frontend-v*" --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)

    echo "📦 Last tags/commits:"
    echo "  CLI: $CLI_LAST_TAG"
    echo "  LIB: $LIB_LAST_TAG"
    echo "  Backend: $BACKEND_LAST_TAG"
    echo "  Frontend: $FRONTEND_LAST_TAG"
fi

# Initialize change flags
CLI_CHANGED=false
LIB_CHANGED=false
BACKEND_CHANGED=false
FRONTEND_CHANGED=false
MONOREPO_CHANGED=false

# Check for changes in packages/cli
if [ "$COMMIT_RANGE" != "HEAD" ]; then
    if git diff --name-only $START_COMMIT..$END_COMMIT | grep -q "^packages/cli/"; then
        CLI_CHANGED=true
        echo "✅ CLI package has changes"
    fi
else
    if git diff --name-only $CLI_LAST_TAG..HEAD | grep -q "^packages/cli/"; then
        CLI_CHANGED=true
        echo "✅ CLI package has changes"
    fi
fi

# Check for changes in packages/client-library
if [ "$COMMIT_RANGE" != "HEAD" ]; then
    if git diff --name-only $START_COMMIT..$END_COMMIT | grep -q "^packages/client-library/"; then
        LIB_CHANGED=true
        echo "✅ Client Library package has changes"
    fi
else
    if git diff --name-only $LIB_LAST_TAG..HEAD | grep -q "^packages/client-library/"; then
        LIB_CHANGED=true
        echo "✅ Client Library package has changes"
    fi
fi

# Check for changes in packages/backend
if [ "$COMMIT_RANGE" != "HEAD" ]; then
    if git diff --name-only $START_COMMIT..$END_COMMIT | grep -q "^packages/backend/"; then
        BACKEND_CHANGED=true
        echo "✅ Backend package has changes"
    fi
else
    if git diff --name-only $BACKEND_LAST_TAG..HEAD | grep -q "^packages/backend/"; then
        BACKEND_CHANGED=true
        echo "✅ Backend package has changes"
    fi
fi

# Check for changes in packages/frontend
if [ "$COMMIT_RANGE" != "HEAD" ]; then
    if git diff --name-only $START_COMMIT..$END_COMMIT | grep -q "^packages/frontend/"; then
        FRONTEND_CHANGED=true
        echo "✅ Frontend package has changes"
    fi
else
    if git diff --name-only $FRONTEND_LAST_TAG..HEAD | grep -q "^packages/frontend/"; then
        FRONTEND_CHANGED=true
        echo "✅ Frontend package has changes"
    fi
fi

# Check for root-level changes (monorepo-wide)
if [ "$COMMIT_RANGE" != "HEAD" ]; then
    # Exclude common files that don't affect releases
    ROOT_CHANGES=$(git diff --name-only $START_COMMIT..$END_COMMIT | grep -v "^packages/" | grep -v "^\.github/" | grep -v "^\.gitignore" | grep -v "^pnpm-lock.yaml" | grep -v "^README.md" | grep -v "^VERSIONING.md" | grep -v "^COMMIT_CONVENTIONS.md" || true)
else
    # Exclude common files that don't affect releases
    ROOT_CHANGES=$(git diff --name-only $CLI_LAST_TAG..HEAD | grep -v "^packages/" | grep -v "^\.github/" | grep -v "^\.gitignore" | grep -v "^pnpm-lock.yaml" | grep -v "^README.md" | grep -v "^VERSIONING.md" | grep -v "^COMMIT_CONVENTIONS.md" || true)
fi

if [ -n "$ROOT_CHANGES" ]; then
    MONOREPO_CHANGED=true
    echo "✅ Monorepo-wide changes detected:"
    echo "$ROOT_CHANGES" | sed 's/^/    /'
fi

# Determine release type based on commit message
RELEASE_TYPE="patch"
if echo "$COMMIT_MSG" | grep -q "fix("; then
    RELEASE_TYPE="patch"
elif echo "$COMMIT_MSG" | grep -q "feat("; then
    RELEASE_TYPE="minor"
elif echo "$COMMIT_MSG" | grep -q "BREAKING CHANGE\|!:"; then
    RELEASE_TYPE="major"
fi

echo "🎯 Release type: $RELEASE_TYPE"
echo "📊 Change Summary:"
echo "  CLI: $CLI_CHANGED"
echo "  LIB: $LIB_CHANGED"
echo "  Backend: $BACKEND_CHANGED"
echo "  Frontend: $FRONTEND_CHANGED"
echo "  Monorepo: $MONOREPO_CHANGED"

# Output for CI
if [ "$CI" = "true" ]; then
    echo "cli-changed=$CLI_CHANGED" >> $GITHUB_OUTPUT
    echo "lib-changed=$LIB_CHANGED" >> $GITHUB_OUTPUT
    echo "backend-changed=$BACKEND_CHANGED" >> $GITHUB_OUTPUT
    echo "frontend-changed=$FRONTEND_CHANGED" >> $GITHUB_OUTPUT
    echo "monorepo-changed=$MONOREPO_CHANGED" >> $GITHUB_OUTPUT
    echo "release-type=$RELEASE_TYPE" >> $GITHUB_OUTPUT
fi

# Exit with code 1 if no changes detected (useful for CI)
if [ "$CLI_CHANGED" = "false" ] && [ "$LIB_CHANGED" = "false" ] && [ "$BACKEND_CHANGED" = "false" ] && [ "$FRONTEND_CHANGED" = "false" ] && [ "$MONOREPO_CHANGED" = "false" ]; then
    echo "❌ No changes detected that require releases"
    exit 1
else
    echo "✅ Changes detected - releases needed"
    exit 0
fi
