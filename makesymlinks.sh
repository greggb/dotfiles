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

function install_terminal_theme {
    if [[ ! -d $dir/tomorrow-theme-master/ ]]; then
        git clone https://github.com/chriskempson/tomorrow-theme.git
        if [[ $dir/tomorrow-theme/ ]]; then
            open "$dir/tomorrow-theme/OS X Terminal/Tomorrow Night Eighties.terminal"
        fi
    fi
}
install_terminal_theme
