alias zshconfig="code ~/.zshrc"
alias aliasconfig="code /Users/gregg/.oh-my-zsh/custom/aliases.sh"
alias gitconfig="code ~/.gitconfig"
alias ll='ls -la'
alias g='git'
alias ga='git add --all'
alias gb='git branch'
alias push='git push'
alias gll='git log'
# View abbreviated SHA, description, and history graph of the latest 20 commits
alias gl='git log --pretty=oneline -n 20 --graph --abbrev-commit'
alias gs='git status -s'
alias gss='git status'
alias gd='git diff'
alias gc='git commit -m'
alias gca='git add . && git commit -vm'
alias gco='git checkout'
alias pull='git pull'
alias prune='git fetch -p'
alias lb='git checkout -'
alias -- -='git checkout -'
alias gcob='git checkout -b'
alias localcommits='git log origin/develop..develop'
alias killtb='pkill "Touch Bar agent"; killall ControlStrip'
alias killdock='killall Dock'
alias clock='cli-clock -b " " -f ▫️'

alias rundev='cd ~/dev/mitx && vagrant ssh'
alias work='cd ~/dev/mitx'

#ICANTYPEGOOD
alias brwe='brew'

alias v='vagrant'
alias ack='ag'
alias cat='bat'
alias ping='prettyping --nolegend'
alias preview="fzf --preview 'bat --color \"always\" {}'"
alias top="sudo htop"
alias find="fd"
# add support for ctrl+o to open selected file in VS Code
export FZF_DEFAULT_OPTS="--bind='ctrl-o:execute(code {})+abort'"

# open new shell with no configs which interfere with the `versions.sh`` script
alias versions='work && env -i  TERM=xterm-256color sh --rcfile -c "versions.sh"'

ld() { cd "$@" && ls; }

mkd() {
	mkdir -p "$@"
	cd "$@" || exit
}
tre() {
     tree -aC -I '.*' --dirsfirst "$@" | less -FRNX
}
go(){ git checkout -b $1 2> /dev/null || git checkout $1; };
# Call from a local repo to open the repository on github/bitbucket in browser
# Modified version of https://github.com/zeke/ghwd
repo() {
	# Figure out github repo base URL
	local base_url
	base_url=$(git config --get remote.origin.url)
	base_url=${base_url%\.git} # remove .git from end of string

	# Fix git@github.com: URLs
	base_url=${base_url//git@github\.com:/https:\/\/github\.com\/}

	# Fix git://github.com URLS
	base_url=${base_url//git:\/\/github\.com/https:\/\/github\.com\/}

	# Fix git@bitbucket.org: URLs
	base_url=${base_url//git@bitbucket.org:/https:\/\/bitbucket\.org\/}

	# Fix git@gitlab.com: URLs
	base_url=${base_url//git@gitlab\.com:/https:\/\/gitlab\.com\/}

	# Validate that this folder is a git folder
	if ! git branch 2>/dev/null 1>&2 ; then
		echo "Not a git repo!"
		exit $?
	fi

	# Find current directory relative to .git parent
	full_path=$(pwd)
	git_base_path=$(cd "./$(git rev-parse --show-cdup)" || exit 1; pwd)
	relative_path=${full_path#$git_base_path} # remove leading git_base_path from working directory

	# If filename argument is present, append it
	if [ "$1" ]; then
		relative_path="$relative_path/$1"
	fi

	# Figure out current git branch
	# git_where=$(command git symbolic-ref -q HEAD || command git name-rev --name-only --no-undefined --always HEAD) 2>/dev/null
	git_where=$(command git name-rev --name-only --no-undefined --always HEAD) 2>/dev/null

	# Remove cruft from branchname
	branch=${git_where#refs\/heads\/}

	[[ $base_url == *bitbucket* ]] && tree="src" || tree="tree"
	url="$base_url/$tree/$branch$relative_path"


	echo "Calling $(type open) for $url"

	open "$url" &> /dev/null || (echo "Using $(type open) to open URL failed." && exit 1);
}
# check if uri is up
isup() {
	local uri=$1

	if curl -s --head  --request GET "$uri" | grep "200 OK" > /dev/null ; then
		notify-send --urgency=critical "$uri is down"
	else
		notify-send --urgency=low "$uri is up"
	fi
}


# OMZ spaeship theme settings
# SPACESHIP_GIT_STATUS_STASHED=""
SPACESHIP_PACKAGE_SHOW=false

