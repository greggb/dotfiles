#!/bin/bash
############################
# .make.sh
# This script creates symlinks from the home directory to any desired dotfiles in ~/dotfiles

#Run with:
# cd ~/dotfiles
# chmod +x makesymlinks.sh
# ./makesymlinks.sh
############################

########## Variables

dir=~/dotfiles                    # dotfiles directory
olddir=~/dotfiles_old             # old dotfiles backup directory
files="zshrc gitconfig osx"       # list of files/folders to symlink in homedir

##########

# create dotfiles_old in homedir
echo "Creating $olddir for backup of any existing dotfiles in ~"
mkdir -p $olddir
echo "...done"

# change to the dotfiles directory
echo "Changing to the $dir directory"
cd $dir
echo "...done"

# move any existing dotfiles in homedir to dotfiles_old directory, then create symlinks from the homedir to any files in the ~/dotfiles directory specified in $files
for file in $files; do
    echo "Moving any existing dotfiles from ~ to $olddir"
    mv ~/.$file ~/dotfiles_old/
    echo "Creating symlink to $file in home directory."
    ln -s $dir/$file ~/.$file
done

function install_syntax_highlighting {
    # Clone zsh syntax highlighting
    if [[ ! -d $dir/zsh-syntax-highlighting/ ]]; then
        git clone https://github.com/zsh-users/zsh-syntax-highlighting.git
        if [[ $dir/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
            mkdir /usr/local/bin/zsh-syntax-highlighting/
            ln -s $dir/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh /usr/local/bin/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
        fi
    fi
}

function install_prompt_pure {
    # Test to see if zshell is installed.  If it is:
    if [ -f /bin/zsh -o -f /usr/bin/zsh ]; then
        # run npm install command for Prompt Pure
        if [[ ! -d /usr/local/share/zsh/site-functions/prompt_pure_setup ]]; then
            npm install --global pure-prompt
        fi
        # Set the default shell to zsh if it isn't currently set to zsh
        if [[ ! $(echo $SHELL) == $(which zsh) ]]; then
            chsh -s $(which zsh)
        fi
    else
        # If zsh isn't installed, get the platform of the current machine
        platform=$(uname);
        # If the platform is OS X, tell the user to install zsh :)
        if [[ $platform == 'Darwin' ]]; then
            echo "Please install zsh, then re-run this script!"
            exit
        fi
    fi
}

function install_terminal_theme {
    if [[ ! -d $dir/tomorrow-theme-master/ ]]; then
        git clone https://github.com/chriskempson/tomorrow-theme.git
        if [[ $dir/tomorrow-theme/ ]]; then
            open "$dir/tomorrow-theme/OS X Terminal/Tomorrow Night Eighties.terminal"
        fi
    fi
}
install_syntax_highlighting
install_prompt_pure
install_terminal_theme
