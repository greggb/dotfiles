#!/bin/sh
# Install all dotfiles into the home directory

DOTFILESDIRREL=$(dirname $0)
cd $DOTFILESDIRREL/..
DOTFILESDIR=$(pwd -P)

[ $(uname -s) = "Darwin" ] && export OSX=1 && export UNIX=1
[ $(uname -s) = "Linux" ] && export LINUX=1 && export UNIX=1
uname -s | grep -q "_NT-" && export WINDOWS=1

for DOTFILE in *; do
  HOMEFILE="$HOME/.$DOTFILE"
  [ -d $DOTFILE ] && DOTFILE="$DOTFILE/"
  DIRFILE="$DOTFILESDIR/$DOTFILE"

  echo $DOTFILE | egrep -q '(^script/$|\.txt$|\.md$)' && continue

    echo $DOTFILE | grep -q 'gitconfig-user' && continue
    echo $DOTFILE | grep -q 'ssh' && continue

  echo $DOTFILE | grep -q '\.sh' \
    && HOMEFILE="$HOME/.$(echo $DOTFILE | sed -e 's/\.sh//')"

  if [ $UNIX ]
  then
    if [ -L "$HOMEFILE" ] && ! [ -d $DOTFILE ]
    then
      ln -sfv "$DIRFILE" "$HOMEFILE"
    else
      rm -rv "$HOMEFILE"
      ln -sv "$DIRFILE" "$HOMEFILE"
    fi
  else
    cp -rv "$DIRFILE" "$HOMEFILE"
  fi
done

echo "Generating SSH keys (https://help.github.com/articles/generating-ssh-keys)..."
ssh-keygen -t rsa -C "mail@digitalpuddle.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa
pbcopy < ~/.ssh/id_rsa.pub
open https://github.com/settings/ssh

echo "Install Homebrew"


echo "Installing global node packages..."
node_packages=(
  diff-so-fancy
  eslint
  listg # list global node modules
  prettyjson
)
npm install -g ${node_packages[@]}

#reload zshrc
source ~/.zshrc
